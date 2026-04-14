import asyncio
import json
import os
import queue
import re
import threading
import time
import urllib.request
import warnings
import platform
import numpy as np
import edge_tts
if platform.system() == "Windows":
    import winsound
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from fpdf import FPDF
from fastapi.responses import FileResponse
import psycopg2
import sounddevice as sd
import speech_recognition as sr
import whisper
import pyttsx3
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from vosk import KaldiRecognizer, Model
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import socket

warnings.filterwarnings("ignore", category=UserWarning)

# ─────────────────────────────────────────────
# AYARLAR
# ─────────────────────────────────────────────
DB_CONFIG = {
    "dbname": "kuyumcu_erp",
    "user": "postgres",
    "password": "Baha0327.",
    "host": "localhost",
    "port": "5432",
}

MILYEM_MAP = {
    "24_AYAR": 1.0000,
    "22_AYAR": 0.9160,
    "18_AYAR": 0.7500,
    "14_AYAR": 0.5850,
}

SAYILAR = {
    "sıfır": 0,   "bir": 1,    "iki": 2,    "üç": 3,    "dört": 4,
    "beş": 5,     "altı": 6,   "yedi": 7,   "sekiz": 8, "dokuz": 9,
    "on": 10,     "yirmi": 20, "otuz": 30,  "kırk": 40, "elli": 50,
    "altmış": 60, "yetmiş": 70,"seksen": 80,"doksan": 90,"yüz": 100,
    "buçuk": 0.5,
}

WHISPER_PROMPT  = "satış, alış, gram, ayar, yirmi iki, on dört, yirmi dört, buçuk, has, miktar"
COOLDOWN_SANIYE = 3
TEMP_WAV        = "temp_islem.wav"

# ─────────────────────────────────────────────
# GLOBAL MODEL DEĞİŞKENLERİ
# Bu modeller lifespan'de yüklenir, her yerden erişilebilir
# ─────────────────────────────────────────────
vosk_model: Model | None = None
whisper_model = None
# Her WebSocket bağlantısı kendi Recognizer'ını oluşturur (thread-safe değil)
# Bu yüzden global tek recognizer yerine per-connection yaklaşım kullanıyoruz

# ─────────────────────────────────────────────
# WEBSOCKET YÖNETİCİSİ
# ─────────────────────────────────────────────
async def tts_ve_gonder(personel_id: int, metin: str):
    """Metni sese çevirir ve ilgili personelin WebSocket kanalına gönderir."""
    try:
        communicate = edge_tts.Communicate(metin, "tr-TR-AhmetNeural")
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        await manager.send_audio(personel_id, audio_data)
        print(f"🔊 Personel {personel_id} için sesli geri bildirim gönderildi.")
    except Exception as e:
        print(f"⚠️ TTS Hatası: {e}")
        await manager.send_text(personel_id, f"MESAJ: {metin}")



def get_local_ip():
    """Bilgisayarın dükkan ağındaki yerel IPv4 adresini bulur."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Gerçek bir bağlantı kurmaz, sadece ağ arayüzünü tetikler
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip



class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, p_id: int):
        await websocket.accept()
        self.active_connections[p_id] = websocket
        print(f"✅ Personel {p_id} bağlandı (Cihaz: {websocket.client})")

    def disconnect(self, p_id: int):
        if p_id in self.active_connections:
            del self.active_connections[p_id]
            print(f"❌ Personel {p_id} ayrıldı.")

    async def send_audio(self, p_id: int, audio_bytes: bytes):
        """Sadece ilgili personelin kulaklığına ses gönderir."""
        ws = self.active_connections.get(p_id)
        if ws:
            try:
                await ws.send_bytes(audio_bytes)
            except Exception as e:
                print(f"[UYARI] Personel {p_id} ses gönderilemedi: {e}")

    async def send_text(self, p_id: int, message: str):
        """Belirli bir personele metin gönderir (durum bildirimi)."""
        ws = self.active_connections.get(p_id)
        if ws:
            try:
                await ws.send_text(message)
            except Exception as e:
                print(f"[UYARI] Personel {p_id} metin gönderilemedi: {e}")

    async def broadcast_text(self, message: str):
        """Tüm bağlı istemcilere metin yayınlar."""
        for p_id, ws in list(self.active_connections.items()):
            try:
                await ws.send_text(message)
            except Exception:
                pass


manager = ConnectionManager()
_main_loop: asyncio.AbstractEventLoop | None = None
_wake_words_map: dict[str, int] = {}
_wake_words_lock = threading.Lock()
_schema_lock = threading.Lock()
_personeller_schema_checked = False
_market_cache_lock = threading.Lock()
_market_cache_data: dict | None = None
_market_cache_prev_data: dict | None = None
_market_cache_ts = 0.0
_MARKET_CACHE_TTL = 300
_tts_lock = threading.Lock()
_tts_engine = None

# ─────────────────────────────────────────────
# UYGULAMA YAŞAM DÖNGÜSÜ
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop, vosk_model, whisper_model

    _main_loop = asyncio.get_running_loop()

    # Modelleri burada yükle — artık global, her yerden erişilebilir
    print("[AI] Modeller yükleniyor...")
    try:
        vosk_model = Model("model")
        whisper_model = whisper.load_model("small")
        print("[AI] Modeller yüklendi.")
    except Exception as e:
        print(f"[UYARI] Model yüklenemedi: {e}")

    try:
        personel_tetikleme_haritasi_yenile()
        print(f"[AI] Wake word havuzu yüklendi: {list(aktif_tetikleme_haritasi().keys())}")
    except Exception as e:
        print(f"[UYARI] Personel wake word havuzu yüklenemedi: {e}")

    # AI daemon thread'ini başlat (mikrofon tabanlı masaüstü modu)
    # WebSocket modu aktifken bu thread'i kapatabilirsin
    # ai_thread = threading.Thread(target=ai_motorunu_baslat, daemon=True)
    # ai_thread.start()

    yield


app = FastAPI(title="Kuyumcu ERP API", lifespan=lifespan)

# Frontend bu adresi çağırıp IP'yi gösterecek
@app.get("/sistem/ip")
def get_server_ip():
    return {"ip": get_local_ip()}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PersonelPayload(BaseModel):
    ad_soyad: str
    tetikleme_kelimesi: str
    rol: str


def normalize_tetikleme_kelimesi(kelime: str) -> str:
    return kelime.strip().lower()


def personeller_tablosunu_dogrula(conn):
    global _personeller_schema_checked
    with _schema_lock:
        if _personeller_schema_checked:
            return
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'personeller'
            """
        )
        mevcut_kolonlar = {r[0] for r in cursor.fetchall()}
        cursor.close()
        beklenen = {"id", "ad_soyad", "tetikleme_kelimesi", "rol"}
        eksik = beklenen - mevcut_kolonlar
        if eksik:
            raise RuntimeError(f"personeller tablosunda eksik kolon(lar): {', '.join(sorted(eksik))}")
        _personeller_schema_checked = True


def personel_tetikleme_haritasi_yenile():
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, tetikleme_kelimesi FROM personeller
            WHERE tetikleme_kelimesi IS NOT NULL AND trim(tetikleme_kelimesi) <> ''
            """
        )
        yeni_harita: dict[str, int] = {}
        for personel_id, tetikleme in cursor.fetchall():
            kelime = normalize_tetikleme_kelimesi(tetikleme)
            if kelime:
                yeni_harita[kelime] = personel_id
        with _wake_words_lock:
            _wake_words_map.clear()
            _wake_words_map.update(yeni_harita)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


def aktif_tetikleme_haritasi():
    with _wake_words_lock:
        return dict(_wake_words_map)

@app.websocket("/ws")
async def websocket_dashboard_endpoint(websocket: WebSocket):
    """
    React Dashboard'un anlık Kasa (işlem) güncellemelerini
    dinlemesi için genel WebSocket bağlantısı.
    """
    await websocket.accept()
    
    # Manager'a eklemek için bu websocket nesnesine özel benzersiz bir ID (int) alıyoruz
    dashboard_id = id(websocket) 
    manager.active_connections[dashboard_id] = websocket
    print(f"🖥️ Dashboard (Kasa Takip) bağlandı! (ID: {dashboard_id})")
    
    try:
        while True:
            # Dashboard sadece dinleyicidir, ancak bağlantıyı açık tutmak 
            # ve ping-pong sağlamak için receive metodunu bekletiyoruz.
            await websocket.receive_text()
            
    except WebSocketDisconnect:
        if dashboard_id in manager.active_connections:
            del manager.active_connections[dashboard_id]
        print(f"❌ Dashboard bağlantısı koptu. (ID: {dashboard_id})")
    except Exception as e:
        if dashboard_id in manager.active_connections:
            del manager.active_connections[dashboard_id]
        print(f"❌ Dashboard hatası: {e}")

# ─────────────────────────────────────────────
# WEBSOCKET ENDPOINT  (TEK, DOĞRU VERSİYON)
# ─────────────────────────────────────────────
@app.websocket("/ws/audio/{personel_id}")
async def websocket_audio_endpoint(websocket: WebSocket, personel_id: int):
    if vosk_model is None or whisper_model is None:
        await websocket.close(code=1011, reason="Modeller yüklenmedi")
        return

    await manager.connect(websocket, personel_id)
    recognizer = KaldiRecognizer(vosk_model, 16000)
    audio_buffer = bytearray()
    state = "WAKE_WORD"

    try:
        while True:
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)

            # ── AŞAMA 1: Vosk — wake word ─────────────────────────
            if state == "WAKE_WORD":
                if recognizer.AcceptWaveform(bytes(data)):
                    metin = json.loads(recognizer.Result()).get("text", "")
                    wake_map = aktif_tetikleme_haritasi()

                    for kw, pid in wake_map.items():
                        if kw in metin and pid == personel_id:
                            print(f"🔔 Personel {personel_id}: '{kw.upper()}' tetiklendi!")
                            state = "COMMAND"
                            audio_buffer.clear()
                            recognizer.Reset()
                            await manager.send_text(personel_id, "DİNLİYORUM")
                            # YENİ: Dashboard'a asistanın dinlediğini bildir
                            await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "LISTENING", "personel_id": personel_id}))
                            break

            # ── AŞAMA 2: Whisper — komut analizi ──────────────────
            elif state == "COMMAND":
                if len(audio_buffer) >= 16000 * 2 * 4:
                    # YENİ: Dashboard'a asistanın düşündüğünü (sesi işlediğini) bildir
                    await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "THINKING", "personel_id": personel_id}))
                    
                    audio_np = (np.frombuffer(bytes(audio_buffer), dtype=np.int16).astype(np.float32) / 32768.0)
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        None, lambda: whisper_model.transcribe(audio_np, language="tr", fp16=False, initial_prompt=WHISPER_PROMPT)
                    )
                    komut_metni = result["text"].strip()
                    islem = sesli_komutu_ayristir(komut_metni, personel_id)

                    if "hata" not in islem:
                        tip_metin  = "alış" if islem["islem_tipi"] == "ALIS" else "satış"
                        ayar_metin = islem["urun_cinsi"].replace("_AYAR", " ayar")
                        onay_metni = f"{islem['brut_miktar']} gram {ayar_metin} {tip_metin}, onaylıyor musunuz?"

                        try:
                            communicate = edge_tts.Communicate(onay_metni, "tr-TR-AhmetNeural")
                            tts_data = b""
                            async for chunk in communicate.stream():
                                if chunk["type"] == "audio":
                                    tts_data += chunk["data"]
                            await manager.send_audio(personel_id, tts_data)
                        except Exception as e:
                            await manager.send_text(personel_id, onay_metni)

                        await tts_ve_gonder(personel_id, onay_metni)

                        await manager.send_text(personel_id, f"ONAY_BEKLE:{json.dumps(islem, ensure_ascii=False)}")
                        # YENİ: Dashboard'a onay kartını göster
                        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "CONFIRMING", "islem": islem}, ensure_ascii=False))
                        state = "CONFIRM"
                        audio_buffer.clear()
                    else:
                        await manager.send_text(personel_id, f"HATA:{islem['hata']}")
                        # YENİ: Dashboard'a hatayı göster
                        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "ERROR", "mesaj": islem["hata"]}, ensure_ascii=False))
                        audio_buffer.clear()
                        state = "WAKE_WORD"
                        # Hata mesajı 3 saniye ekranda kalsın diye arka planda sıfırlama tetikliyoruz
                        asyncio.create_task(asyncio.sleep(3))
                        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "IDLE"}))

            # ── AŞAMA 3: Onay dinleme ─────────────────────────────
            elif state == "CONFIRM":
                if recognizer.AcceptWaveform(bytes(data)):
                    metin = json.loads(recognizer.Result()).get("text", "").lower()
                    if "onay" in metin or "evet" in metin:
                        await manager.send_text(personel_id, "ONAYLANDI")
                        # YENİ: İşlem bitti, arayüzü uyut
                        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "IDLE"}))
                        recognizer.Reset()
                        state = "WAKE_WORD"
                    elif "iptal" in metin or "hayır" in metin:
                        await manager.send_text(personel_id, "İPTAL")
                        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "IDLE"}))
                        recognizer.Reset()
                        state = "WAKE_WORD"

    except WebSocketDisconnect:
        manager.disconnect(personel_id)
        # Personel koparsa UI'ı da sıfırla
        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "IDLE"}))
    except Exception as e:
        manager.disconnect(personel_id)


# ─────────────────────────────────────────────
# THREAD → EVENT LOOP KÖPRÜSÜ
# ─────────────────────────────────────────────
def broadcast_from_thread(payload: str):
    """AI thread'inden FastAPI event loop'una güvenli broadcast."""
    if _main_loop is None:
        return
    asyncio.run_coroutine_threadsafe(
        manager.broadcast_text(payload), _main_loop
    )


def send_audio_from_thread(p_id: int, audio_bytes: bytes):
    """AI thread'inden belirli bir personele ses gönderir."""
    if _main_loop is None:
        return
    asyncio.run_coroutine_threadsafe(
        manager.send_audio(p_id, audio_bytes), _main_loop
    )


# ─────────────────────────────────────────────
# METİN İŞLEME
# ─────────────────────────────────────────────
def metni_temizle(metin: str) -> str:
    return metin.replace(",", ".").replace("-", " ").strip().lower()


def metni_sayiya_dok(metin: str) -> str:
    metin = metni_temizle(metin)
    parcalar = metin.split()
    yeni = []
    toplam = 0.0
    for i, p in enumerate(parcalar):
        if p in SAYILAR:
            toplam += SAYILAR[p]
            sonraki_sayi = (i + 1 < len(parcalar)) and (parcalar[i + 1] in SAYILAR)
            if not sonraki_sayi:
                yeni.append(str(int(toplam)) if toplam == int(toplam) else str(toplam))
                toplam = 0.0
        else:
            yeni.append(p)
    return " ".join(yeni)


def sesli_komutu_ayristir(ham_metin: str, personel_id: int) -> dict:
    metin = metni_sayiya_dok(ham_metin)
    print(f"  [İşlenen metin]: {metin}")

    if "alış" in metin or "alıs" in metin:
        islem_tipi = "ALIS"
    elif "satış" in metin or "satis" in metin:
        islem_tipi = "SATIS"
    else:
        return {"hata": "İşlem tipi (Alış/Satış) bulunamadı."}

    ayar_match = re.search(r"\b(14|18|22|24)\b", metin)
    if not ayar_match:
        return {"hata": "Geçerli altın ayarı (14, 18, 22, 24) bulunamadı."}

    ayar_degeri = ayar_match.group(1)
    urun_cinsi  = f"{ayar_degeri}_AYAR"

    fiyat_match = re.search(r"(?:fiyat|tutar|lira)\s*(\d+(?:\.\d+)?)", metin)
    birim_fiyat = float(fiyat_match.group(1)) if fiyat_match else 0.0

    kalan = metin.replace(ayar_degeri, "", 1)
    miktar_match = re.search(r"(\d+(?:[.,]\d+)?)", kalan)
    if not miktar_match:
        return {"hata": "Gramaj (miktar) bulunamadı."}

    brut_miktar = float(miktar_match.group(1).replace(",", "."))
    milyem      = MILYEM_MAP.get(urun_cinsi, 0.0)

    return {
        "personel_id": personel_id,
        "islem_tipi":  islem_tipi,
        "urun_cinsi":  urun_cinsi,
        "brut_miktar": brut_miktar,
        "birim_fiyat": birim_fiyat,
        "milyem":      milyem,
    }


# ─────────────────────────────────────────────
# VERİTABANI
# ─────────────────────────────────────────────
def veritabanina_yaz(islem: dict):
    try:
        conn   = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO islemler (personel_id, islem_tipi, urun_cinsi, brut_miktar, milyem, birim_fiyat)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, net_has_miktar;  # YENİ: id bilgisini de istiyoruz
            """,
            (
                islem["personel_id"],
                islem["islem_tipi"],
                islem["urun_cinsi"],
                islem["brut_miktar"],
                islem["milyem"],
                islem["birim_fiyat"],
            ),
        )
        row_id, net_has = cursor.fetchone()  # YENİ: row_id'yi aldık
        net_has = float(net_has)
        conn.commit()
        cursor.close()
        conn.close()

        # Dashboard'a yeni işlem olarak fırlat (type ve id eklendi)
        payload = json.dumps({
            "type":   "NEW_TX",
            "id":     row_id,
            "tip":    islem["islem_tipi"],
            "miktar": islem["brut_miktar"],
            "ayar":   islem["urun_cinsi"],
            "has":    net_has,
        }, ensure_ascii=False)
        broadcast_from_thread(payload)

    except Exception as e:
        print(f"  [DB HATA]: {e}")


# ─────────────────────────────────────────────
# YARDIMCI FONKSİYONLAR
# ─────────────────────────────────────────────
def sistem_biipi(frekans, sure):
    if platform.system() == "Windows":
        winsound.Beep(frekans, sure)
    else:
        print("\a", end="", flush=True)



def _parse_decimal(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value.strip().replace(",", "."))
    except Exception:
        return None


def _tcmb_currency_value(root, code: str) -> float | None:
    node = root.find(f".//Currency[@CurrencyCode='{code}']")
    if node is None:
        return None
    unit = _parse_decimal((node.findtext("Unit") or "1"))
    forex_selling = _parse_decimal(node.findtext("ForexSelling")) or _parse_decimal(node.findtext("BanknoteSelling"))
    if forex_selling is None:
        return None
    unit = unit or 1
    return forex_selling / unit


def _market_with_trends(current: dict, previous: dict | None):
    previous = previous or {}
    def trend(key):
        old, new = previous.get(key), current.get(key)
        if old is None or new is None: return "same"
        return "up" if new > old else "down" if new < old else "same"
    payload = dict(current)
    payload["trends"] = {
        "usd_try": trend("usd_try"),
        "eur_try": trend("eur_try"),
        "gram_altin_24k_try": trend("gram_altin_24k_try"),
    }
    return payload


def _fetch_market_data_from_tcmb():
    with urllib.request.urlopen("https://www.tcmb.gov.tr/kurlar/today.xml", timeout=15) as resp:
        xml_raw = resp.read()
    root = ET.fromstring(xml_raw)
    usd_try = _tcmb_currency_value(root, "USD")
    eur_try = _tcmb_currency_value(root, "EUR")
    xau_value = _tcmb_currency_value(root, "XAU")
    if usd_try is None or eur_try is None:
        raise RuntimeError("TCMB kur verisi okunamadı.")
    if xau_value is not None and xau_value > 0:
        gram_altin_24k_try = xau_value / 31.1035
    else:
        gram_altin_24k_try = (2300.0 * usd_try) / 31.1035
    return {
        "usd_try": round(usd_try, 4),
        "eur_try": round(eur_try, 4),
        "gram_altin_24k_try": round(gram_altin_24k_try, 2),
        "guncellenme_ts": int(time.time()),
        "kaynak": "TCMB",
    }


def _get_market_data_cached():
    global _market_cache_data, _market_cache_prev_data, _market_cache_ts
    now = time.time()
    with _market_cache_lock:
        if _market_cache_data and (now - _market_cache_ts) < _MARKET_CACHE_TTL:
            return _market_with_trends(_market_cache_data, _market_cache_prev_data)
    yeni = _fetch_market_data_from_tcmb()
    with _market_cache_lock:
        _market_cache_prev_data = _market_cache_data
        _market_cache_data = yeni
        _market_cache_ts = now
        return _market_with_trends(_market_cache_data, _market_cache_prev_data)


def _query_islemler(conn, gunler, tip=None, personel_id=None, limit=None):
    cursor = conn.cursor()
    query = """
        SELECT i.id, i.islem_tarihi, i.islem_tipi, i.urun_cinsi,
               i.brut_miktar, i.net_has_miktar, i.birim_fiyat,
               COALESCE(p.ad_soyad, 'Bilinmiyor') AS personel_ad_soyad
        FROM islemler i
        LEFT JOIN personeller p ON p.id = i.personel_id
        WHERE i.islem_tarihi >= NOW() - (%s * INTERVAL '1 day')
    """
    params: list = [gunler]
    if tip:
        tip_upper = tip.strip().upper()
        if tip_upper not in {"ALIS", "SATIS"}:
            cursor.close()
            raise HTTPException(status_code=400, detail="tip parametresi ALIS veya SATIS olmalıdır.")
        query += " AND i.islem_tipi = %s"
        params.append(tip_upper)
    if personel_id is not None:
        query += " AND i.personel_id = %s"
        params.append(personel_id)
    query += " ORDER BY i.islem_tarihi DESC"
    if limit is not None:
        query += " LIMIT %s"
        params.append(limit)
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    cursor.close()
    return rows


# ─────────────────────────────────────────────
# HTTP ENDPOINT'LER
# ─────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"durum": "çalışıyor"}


@app.get("/personeller")
def personelleri_getir():
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT id, ad_soyad, tetikleme_kelimesi, rol FROM personeller ORDER BY id ASC")
        rows = cursor.fetchall()
        return [{"id": r[0], "ad_soyad": r[1], "tetikleme_kelimesi": r[2], "rol": r[3]} for r in rows]
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Personeller getirilemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.post("/personeller")
def personel_ekle(payload: PersonelPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO personeller (ad_soyad, tetikleme_kelimesi, rol) VALUES (%s, %s, %s) RETURNING id, ad_soyad, tetikleme_kelimesi, rol",
            (payload.ad_soyad.strip(), normalize_tetikleme_kelimesi(payload.tetikleme_kelimesi), payload.rol.strip()),
        )
        row = cursor.fetchone()
        conn.commit()
        personel_tetikleme_haritasi_yenile()
        return {"id": row[0], "ad_soyad": row[1], "tetikleme_kelimesi": row[2], "rol": row[3]}
    except psycopg2.errors.UniqueViolation:
        if conn: conn.rollback()
        raise HTTPException(status_code=409, detail="Bu tetikleme kelimesi zaten kullanılıyor.")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Personel eklenemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.put("/personeller/{personel_id}")
def personel_guncelle(personel_id: int, payload: PersonelPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE personeller SET ad_soyad=%s, tetikleme_kelimesi=%s, rol=%s WHERE id=%s RETURNING id, ad_soyad, tetikleme_kelimesi, rol",
            (payload.ad_soyad.strip(), normalize_tetikleme_kelimesi(payload.tetikleme_kelimesi), payload.rol.strip(), personel_id),
        )
        row = cursor.fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Personel bulunamadı.")
        conn.commit()
        personel_tetikleme_haritasi_yenile()
        return {"id": row[0], "ad_soyad": row[1], "tetikleme_kelimesi": row[2], "rol": row[3]}
    except psycopg2.errors.UniqueViolation:
        if conn: conn.rollback()
        raise HTTPException(status_code=409, detail="Bu tetikleme kelimesi zaten kullanılıyor.")
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Personel güncellenemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.delete("/islemler/{islem_id}")
def islem_sil_ve_geri_al(islem_id: int):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Silmeden önce işlemin has miktarını ve tipini öğrenelim ki UI'da bakiyeyi geri saralım
        cursor.execute("SELECT islem_tipi, net_has_miktar FROM islemler WHERE id = %s", (islem_id,))
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="İşlem bulunamadı veya zaten silinmiş.")
            
        islem_tipi, net_has = row
        
        # İşlemi veritabanından kalıcı olarak sil
        cursor.execute("DELETE FROM islemler WHERE id = %s", (islem_id,))
        conn.commit()
        cursor.close()
        
        # Tüm bağlı Dashboard'lara silme emrini broadcast et
        payload = json.dumps({
            "type": "UNDO_TX",
            "id": islem_id,
            "tip": islem_tipi,
            "has": float(net_has)
        })
        broadcast_from_thread(payload)
        
        return {"mesaj": "İşlem başarıyla geri alındı."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Geri alma başarısız: {e}")
    finally:
        if conn: conn.close()

@app.delete("/personeller/{personel_id}")
def personel_sil(personel_id: int):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM personeller WHERE id = %s RETURNING id", (personel_id,))
        row = cursor.fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Personel bulunamadı.")
        conn.commit()
        personel_tetikleme_haritasi_yenile()
        return {"mesaj": "Personel silindi.", "id": row[0]}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Personel silinemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.get("/islemler")
def islemleri_getir(
    gunler: int = Query(30, ge=1, le=365),
    tip: str | None = Query(None),
    personel_id: int | None = Query(None),
    limit: int | None = Query(None, ge=1, le=500),
):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        rows = _query_islemler(conn, gunler=gunler, tip=tip, personel_id=personel_id, limit=limit)
        return [
            {
                "id": r[0],
                "islem_tarihi": r[1].isoformat() if r[1] else None,
                "islem_tipi": r[2],
                "urun_cinsi": r[3],
                "brut_miktar": float(r[4]) if r[4] is not None else 0.0,
                "net_has_miktar": float(r[5]) if r[5] is not None else 0.0,
                "birim_fiyat": float(r[6]) if r[6] is not None else 0.0,
                "personel_ad_soyad": r[7],
            }
            for r in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"İşlemler getirilemedi: {e}")
    finally:
        if conn: conn.close()

@app.get("/personeller/aktif")
def aktif_personeller():
    """
    Sisteme şu an WebSocket üzerinden bağlı (mikrofonu açık/dinlemede olan)
    personellerin ID listesini döndürür. Veritabanına gitmez, RAM'den okur.
    """
    # manager instance'ı içerisindeki dictionary'nin key'leri personel_id'lerdir
    return list(manager.active_connections.keys())

@app.get("/personeller/istatistik")
def personel_istatistikleri():
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.id, p.ad_soyad, p.tetikleme_kelimesi, p.rol,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='ALIS' THEN i.net_has_miktar ELSE 0 END),0) AS toplam_alis_has,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='SATIS' THEN i.net_has_miktar ELSE 0 END),0) AS toplam_satis_has,
                   COALESCE(SUM(COALESCE(i.brut_miktar,0)*COALESCE(i.birim_fiyat,0)),0) AS toplam_tl_hacim,
                   COUNT(i.id) AS islem_sayisi
            FROM personeller p
            LEFT JOIN islemler i ON i.personel_id = p.id
            GROUP BY p.id, p.ad_soyad, p.tetikleme_kelimesi, p.rol
            ORDER BY p.id ASC
        """)
        rows = cursor.fetchall()
        result = []
        for r in rows:
            alis, satis = float(r[4] or 0), float(r[5] or 0)
            islem_sayisi = int(r[7] or 0)
            result.append({
                "id": r[0], "ad_soyad": r[1], "tetikleme_kelimesi": r[2], "rol": r[3],
                "toplam_alis_has": alis, "toplam_satis_has": satis,
                "net_has": alis - satis,
                "toplam_tl_hacim": float(r[6] or 0),
                "islem_sayisi": islem_sayisi,
                "performans_skor": min(100, round(islem_sayisi * 2.5, 1)),
            })
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Personel istatistikleri getirilemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.get("/piyasa/kurlar")
def piyasa_kurlari():
    try:
        return _get_market_data_cached()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Piyasa verisi alınamadı: {e}")


class CorporatePDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Corporate", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 5, "Bu rapor Çapar ERP sistemi tarafından otomatik oluşturulmuştur.", align="L")
        self.cell(0, 5, f"Sayfa {self.page_no()}", align="R")


@app.get("/rapor/pdf")
def generate_pdf_report(
    gunler: int = Query(30, ge=1, le=365),
    tip: str | None = Query(None),
    personel_id: int | None = Query(None),
):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        rows = _query_islemler(conn, gunler=gunler, tip=tip, personel_id=personel_id, limit=500)
        toplam_alis  = sum(float(r[5] or 0) for r in rows if r[2] == "ALIS")
        toplam_satis = sum(float(r[5] or 0) for r in rows if r[2] == "SATIS")
        net_has = toplam_alis - toplam_satis

        pdf = CorporatePDF()
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()

        font_candidates = [
            r"C:\Windows\Fonts\DejaVuSans.ttf",
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
        ]
        font_path = next((p for p in font_candidates if os.path.exists(p)), None)
        if not font_path:
            raise RuntimeError("Unicode font bulunamadı.")
        pdf.add_font("Corporate", "", font_path)
        pdf.set_font("Corporate", "", 11)

        pdf.set_text_color(25, 25, 25)
        pdf.set_font("Corporate", "", 15)
        pdf.cell(0, 10, "ÇAPAR KUYUMCULUK - KURUMSAL İŞLEM RAPORU", ln=1, align="C")
        pdf.set_font("Corporate", "", 10)
        pdf.cell(0, 6, f"Rapor Tarihi: {time.strftime('%d.%m.%Y %H:%M')}", ln=1, align="R")
        pdf.ln(2)

        pdf.set_fill_color(245, 245, 245)
        pdf.set_draw_color(220, 220, 220)
        pdf.rect(10, pdf.get_y(), 190, 20, style="DF")
        y0 = pdf.get_y() + 4
        pdf.set_xy(14, y0)
        pdf.cell(58, 6, f"Toplam Alış (Has): {toplam_alis:.3f} gr", ln=0)
        pdf.cell(58, 6, f"Toplam Satış (Has): {toplam_satis:.3f} gr", ln=0)
        pdf.cell(58, 6, f"Net Has Bakiye: {net_has:.3f} gr", ln=1)
        pdf.ln(14)

        headers = ["Tarih", "Personel", "Tip", "Ayar", "Brut (gr)", "Has (gr)", "Birim Fiyat"]
        widths  = [32, 38, 18, 22, 24, 24, 30]
        pdf.set_fill_color(230, 230, 230)
        pdf.set_font("Corporate", "", 9)
        for i, h in enumerate(headers):
            pdf.cell(widths[i], 8, h, border=1, align="C", fill=True)
        pdf.ln()

        pdf.set_font("Corporate", "", 8)
        fill = False
        for row in rows:
            t_str = row[1].strftime("%d.%m.%Y %H:%M") if row[1] else "-"
            vals = [t_str, str(row[7]), str(row[2]), str(row[3]),
                    f"{float(row[4] or 0):.3f}", f"{float(row[5] or 0):.3f}", f"{float(row[6] or 0):.2f}"]
            pdf.set_fill_color(248, 248, 248) if fill else pdf.set_fill_color(255, 255, 255)
            for i, val in enumerate(vals):
                pdf.cell(widths[i], 7, val, border=1, align="R" if i >= 4 else "L", fill=fill)
            pdf.ln()
            fill = not fill

        report_path = f"islem_raporu_{int(time.time())}.pdf"
        pdf.output(report_path)
        return FileResponse(report_path, filename="Capar_Kuyumculuk_Kurumsal_Rapor.pdf")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF oluşturulamadı: {e}")
    finally:
        if conn: conn.close()