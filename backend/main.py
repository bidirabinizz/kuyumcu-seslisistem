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

# Mevcut MILYEM_MAP aynen kalıyor
MILYEM_MAP = {
    "24_AYAR": 1.0000,
    "22_AYAR": 0.9160,
    "18_AYAR": 0.7500,
    "14_AYAR": 0.5850,
}

# ─────────────────────────────────────────────
# MERKEZİ SARRAFİYE KONFİGÜRASYONU (Tek Kaynak)
# Gram ağırlıkları: Çeyrek 1.75g, Yarım 3.50g, Tam 7.00g, Ata 7.20g
# Has = Gram * 0.9160 (22 Ayar milyemi)
# ─────────────────────────────────────────────
SARRAFIYE_CONFIG = {
    "çeyrek": {
        "urun_cinsi":    "CEYREK_ALTIN",
        "gram_agirlik":  1.75,
        "has_karsiligi": round(1.75 * 0.9160, 4),   # 1.6030
    },
    "yarım": {
        "urun_cinsi":    "YARIM_ALTIN",
        "gram_agirlik":  3.50,
        "has_karsiligi": round(3.50 * 0.9160, 4),   # 3.2060
    },
    "tam": {
        "urun_cinsi":    "TAM_ALTIN",
        "gram_agirlik":  7.00,
        "has_karsiligi": round(7.00 * 0.9160, 4),   # 6.4120
    },
    "ata": {
        "urun_cinsi":    "ATA_ALTIN",
        "gram_agirlik":  7.20,
        "has_karsiligi": round(7.20 * 0.9160, 4),   # 6.5952
    },
}

# Sarrafiye DB kodu → NLP anahtarı eşlemesi (güvenli ters arama için)
SARRAFIYE_CINSI_MAP = {
    cfg["urun_cinsi"]: cfg["has_karsiligi"]
    for cfg in SARRAFIYE_CONFIG.values()
}

# Pırlanta tanıyıcı kelimeler
PIRLANTA_KELIMELER = ["pırlanta", "elmas", "tektaş", "beştaş"]

SAYILAR = {
    "sıfır": 0,   "bir": 1,    "iki": 2,    "üç": 3,    "dört": 4,
    "beş": 5,     "altı": 6,   "yedi": 7,   "sekiz": 8, "dokuz": 9,
    "on": 10,     "yirmi": 20, "otuz": 30,  "kırk": 40, "elli": 50,
    "altmış": 60, "yetmiş": 70,"seksen": 80,"doksan": 90,"yüz": 100,
    "bin": 1000, "onbin":10000, "yüzbin":100000, "milyon": 1000000,
    "buçuk": 0.5,
}

WHISPER_PROMPT = (
    "alış satış gram ayar yirmi iki on dört yirmi dört on sekiz buçuk "
    "has miktar fiyat lira kaydet evet hayır tamam iptal sil geri al"
)
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
    try:
        communicate = edge_tts.Communicate(metin, "tr-TR-AhmetNeural")
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        # 1. Önce Flutter'a süreyi bildir (milisaniye cinsinden)
        # MP3 bitrate tahmini: edge_tts çıktısı ~32kbps
        estimated_ms = max(1500, int(len(audio_data) / 4000))
        await manager.send_text(personel_id, f"TTS_START:{estimated_ms}")
        
        # Kısa bekle ki Flutter mesajı işlesin
        await asyncio.sleep(0.05)
        
        # 2. Sonra sesi gönder
        await manager.send_audio(personel_id, audio_data)
        
        print(f"🔊 Personel {personel_id} → ses gönderildi (~{estimated_ms}ms)")
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
        from faster_whisper import WhisperModel
        whisper_model = WhisperModel("medium", device="cpu", compute_type="int8")
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

class IslemPayload(BaseModel):
    personel_id: int
    islem_tipi: str      # "ALIS" veya "SATIS"
    urun_cinsi: str      # "24_AYAR", "22_AYAR", "18_AYAR", "14_AYAR", "CEYREK_ALTIN" vb.
    brut_miktar: float   # Gram cinsinden (ALTIN) veya adet (SARRAFIYE/PIRLANTA)
    birim_fiyat: float   # İşlemin yapıldığı TL fiyatı
    urun_kategorisi: str = "ALTIN"
    islem_birimi: str = "GRAM"
    odeme_tipi: str = "NAKIT"   # "NAKIT" veya "KART"
    adet: int = 1               # Sarrafiye ve pırlanta için adet


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
    
    # Bekleyen işlem verileri (Döngü dışında tutulmalı!)
    pending_tx = None
    pending_undo_id = None

    try:
        while True:
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)

           # ── AŞAMA 1: Wake Word ─────────────────────────
            if state == "WAKE_WORD":
                if recognizer.AcceptWaveform(bytes(data)):
                    metin = json.loads(recognizer.Result()).get("text", "")
                    wake_map = aktif_tetikleme_haritasi()
                    for kw, pid in wake_map.items():
                        if kw in metin and pid == personel_id:
                            state = "COMMAND"
                            audio_buffer.clear()
                            recognizer.Reset()
                            await manager.send_text(personel_id, "DİNLİYORUM")
                            
                            # EKLENEN SATIR: Asistanın kulaklığa sesli olarak yanıt vermesi için
                            await tts_ve_gonder(personel_id, "Dinliyorum.")
                            
                            await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "LISTENING", "personel_id": personel_id}))
                            break

            # ── AŞAMA 2: Komut Analizi ──────────────────
            elif state == "COMMAND":
                # VOSK'a sesi göndererek kullanıcının cümleyi bitirip es (duraksama) vermesini bekle
                cumle_bitti = recognizer.AcceptWaveform(bytes(data))
                
                # 🌟 DEĞİŞİKLİK BURADA: Süreleri uzatıyoruz 🌟
                # Maksimum süreyi 6 saniyeden 10 saniyeye çıkarıyoruz (Düşünme payı)
                zaman_doldu = len(audio_buffer) >= 16000 * 2 * 10  
                
                # Minimum süreyi 2.5 saniyeden 3.8 saniyeye çıkarıyoruz. 
                # (Kullanıcı nefes alsa bile 3.8 saniye dolmadan asistan sözünü kesmeyecek)
                min_sure_gecti = len(audio_buffer) > 16000 * 2 * 3.8 
                
                # Kullanıcı sustuysa (ve en az 3.8 sn geçtiyse) VEYA 10 saniyelik maksimum sınır dolduysa
                if (cumle_bitti and min_sure_gecti) or zaman_doldu:
                    await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "THINKING", "personel_id": personel_id}))
                    
                    audio_np = (np.frombuffer(bytes(audio_buffer), dtype=np.int16).astype(np.float32) / 32768.0)
                    loop = asyncio.get_running_loop()

                    def faster_transcribe():
                        segments, info = whisper_model.transcribe(
                            audio_np,
                            language="tr",
                            initial_prompt=WHISPER_PROMPT,
                            temperature=0.0,
                            condition_on_previous_text=False,
                            vad_filter=True,
                            vad_parameters=dict(
                                min_silence_duration_ms=500,
                                speech_pad_ms=200,
                            ),
                            beam_size=5,
                        )
                        return "".join(s.text for s in segments).strip()

                    komut_metni = await loop.run_in_executor(None, faster_transcribe)
                    islem = sesli_komutu_ayristir(komut_metni, personel_id)

                    # DURUM A: Geri Alma İsteği
                    if islem.get("tip") == "UNDO_REQUEST":
                        conn = psycopg2.connect(**DB_CONFIG)
                        cursor = conn.cursor()
                        cursor.execute("""
                            SELECT id, islem_tipi, urun_cinsi, brut_miktar 
                            FROM islemler WHERE personel_id = %s 
                            ORDER BY islem_tarihi DESC LIMIT 1
                        """, (personel_id,))
                        last_tx = cursor.fetchone()
                        cursor.close()
                        conn.close()

                        if last_tx:
                            tx_id, tx_tip, tx_ayar, tx_miktar = last_tx
                            tip_str = "alış" if tx_tip == "ALIS" else "satış"
                            onay_metni = f"Son işleminiz {tx_miktar} gram {tx_ayar.split('_')[0]} ayar {tip_str}. Silmemi onaylıyor musunuz?"
                            pending_undo_id = tx_id
                            await tts_ve_gonder(personel_id, onay_metni)
                            state = "CONFIRM_UNDO"
                        else:
                            await tts_ve_gonder(personel_id, "Silinecek işlem bulunamadı.")
                            state = "WAKE_WORD"
                            recognizer.Reset() # HATA DURUMUNDA SIFIRLA
                        audio_buffer.clear()

                    # DURUM B: Normal İşlem Kaydı
                    elif islem.get("tip") == "NORMAL_TX":
                        tip_metin     = "alış" if islem["islem_tipi"] == "ALIS" else "satış"
                        odeme_str     = "kartlı" if islem.get("odeme_tipi") == "KART" else "nakit"
                        kategori      = islem.get("urun_kategorisi", "ALTIN")

                        if kategori == "SARRAFIYE":
                            adet      = int(islem.get("miktar", 1))
                            urun_adı  = islem["urun_cinsi"].replace("_ALTIN", "").replace("_", " ").title()
                            onay_metni = (
                                f"{adet} adet {urun_adı}, {odeme_str} {tip_metin}, "
                                f"toplam {islem['net_has']:.3f} gram has. Kaydedeyim mi?"
                            )
                        elif kategori == "PIRLANTA":
                            adet      = int(islem.get("miktar", 1))
                            onay_metni = f"{adet} adet pırlanta, {odeme_str} {tip_metin}. Kaydedeyim mi?"
                        else:
                            onay_metni = (
                                f"{islem['miktar']} gram {islem['urun_cinsi'].replace('_AYAR', '')} ayar, "
                                f"{odeme_str} {tip_metin}. Kaydedeyim mi?"
                            )

                        # Varsa uyarıyı sesli bildir
                        if islem.get("uyari"):
                            await tts_ve_gonder(personel_id, f"Uyarı: {islem['uyari']}")
                            await asyncio.sleep(0.1)

                        pending_tx = islem
                        
                        await manager.broadcast_text(json.dumps({
                            "type": "VOICE_STATE", 
                            "state": "CONFIRMING", 
                            "personel_id": personel_id,
                            "islem": islem
                        }))
                        
                        await tts_ve_gonder(personel_id, onay_metni)
                        state = "CONFIRM"
                        audio_buffer.clear()
                        recognizer.Reset()
                    
                    # DURUM C: Hata
                    else:
                        await manager.send_text(personel_id, f"HATA:{islem.get('hata')}")
                        state = "WAKE_WORD"
                        audio_buffer.clear()
                        recognizer.Reset()  # ÇOK ÖNEMLİ: Kendi kendine uyanma döngüsünü tamamen kırar!

            # ── AŞAMA 3: Onay Dinleme ─────────────────────────────
            elif state in ["CONFIRM", "CONFIRM_UNDO"]:
                if recognizer.AcceptWaveform(bytes(data)):
                    metin = json.loads(recognizer.Result()).get("text", "").lower()
                    
                    # YENİ KONTROL: Sadece bu kesin kelimeleri söylerse işlemi yap
                    evet_mi = any(k in metin for k in ["evet", "tamam", "onaylıyorum", "kaydet", "doğru"])
                    hayir_mi = any(k in metin for k in ["hayır", "iptal", "dur", "onaylamıyorum", "yanlış"])

                    if evet_mi:
                        if state == "CONFIRM" and pending_tx:
                            # İşlemi yap ve sonucu kontrol et
                            basarili_mi = veritabanina_yaz(pending_tx)
                            
                            if basarili_mi:
                                await tts_ve_gonder(personel_id, "İşlem kaydedildi.")
                            else:
                                await tts_ve_gonder(personel_id, "Kayıt başarısız oldu, lütfen ekranı kontrol edin.")
                                
                        elif state == "CONFIRM_UNDO" and pending_undo_id:
                            islem_sil_ve_geri_al(pending_undo_id)
                            await tts_ve_gonder(personel_id, "İşlem silindi.")
                        
                        state = "WAKE_WORD"
                        pending_tx = pending_undo_id = None
                        recognizer.Reset()
                        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "IDLE"}))
                    
                    elif hayir_mi:
                        await tts_ve_gonder(personel_id, "İşlem iptal edildi.")
                        state = "WAKE_WORD"
                        pending_tx = pending_undo_id = None
                        recognizer.Reset()
                        await manager.broadcast_text(json.dumps({"type": "VOICE_STATE", "state": "IDLE"}))

    except WebSocketDisconnect:
        manager.disconnect(personel_id)
    except Exception as e:
        print(f"Sistem Hatası: {e}")
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


def _odeme_tipini_ayristir(metin: str) -> str:
    """
    Metinden nakit/kart ödeme tipini ayıklar.
    Bulunamazsa varsayılan 'NAKIT' döndürür.
    """
    kart_kelimeleri = ["kartlı", "kartla", "kart", "kredi", "banka", "pos", "temassız"]
    if any(k in metin for k in kart_kelimeleri):
        return "KART"
    return "NAKIT"


def sesli_komutu_ayristir(ham_metin: str, personel_id: int) -> dict:
    # 1. Kelimeleri matematiksel sembollere çevir
    ham_metin = ham_metin.lower()
    ham_metin = ham_metin.replace("nokta", ".").replace("virgül", ".").replace("buçuk", ".5")
    
    # 2. Yazıyla söylenen sayıları (yirmi, yüz vs.) rakamlara dönüştür
    metin = metni_sayiya_dok(ham_metin)
    
    # 🌟 3. HASSAS ONDALIK BİRLEŞTİRİCİ 🌟
    metin = metin.replace(" . ", ".").replace(" .", ".").replace(". ", ".")
    eski_metin = ""
    while metin != eski_metin:
        eski_metin = metin
        metin = re.sub(r"(\d+\.\d*)\s+(\d+)(?!\s+ayar)", r"\1\2", metin)
    
    print(f"  [İşlenen metin]: {metin}")

    # --- GERİ ALMA KONTROLÜ ---
    silme_kelimeleri = [
        "işlemi sil", "kaydı sil", "işlemi iptal et", 
        "işlemi geri al", "son işlemi", "yanlış oldu"
    ]
    if any(k in metin for k in silme_kelimeleri):
        return {"tip": "UNDO_REQUEST", "personel_id": personel_id}

    # --- İŞLEM TİPİ KONTROLÜ ---
    if "alış" in metin or "alıs" in metin or "aliş" in metin or "alis" in metin:
        islem_tipi = "ALIS"
    elif "satış" in metin or "satis" in metin or "satiş" in metin:
        islem_tipi = "SATIS"
    else:
        return {"hata": f"İşlem tipi bulunamadı. Duyulan: {ham_metin}"}

    # --- FİYAT / TUTAR KONTROLÜ (Ortak) ---
    fiyat_match = re.search(r"(?:fiyat|tutar|lira|dolar|euro)\s*(\d+(?:\.\d+)?)", metin)
    birim_fiyat = float(fiyat_match.group(1)) if fiyat_match else 0.0

    # Ödeme tipini tüm senaryolar için şimdiden belirle (PIRLANTA senaryosu öncesi)
    odeme_tipi = _odeme_tipini_ayristir(metin)

    # 💎 SENARYO 1: PIRLANTA KONTROLÜ (Adet Bazlı)
    pirlanta_kelimeler = ["pırlanta", "elmas", "tektaş", "beştaş"]
    if any(pk in metin for pk in pirlanta_kelimeler):
        adet_match = re.search(r"(\d+)\s*(?:adet|tane)?\s*(?:pırlanta|elmas|tektaş|beştaş)", metin)
        uyari = None
        if adet_match:
            miktar = float(adet_match.group(1))
        else:
            miktar = 1.0
            uyari = f"Adet bulunamadı, 1 adet varsayıldı. Duyulan: {ham_metin}"
            print(f"  [UYARI] {uyari}")
        sonuc = {
            "tip": "NORMAL_TX", "personel_id": personel_id, "islem_tipi": islem_tipi,
            "urun_kategorisi": "PIRLANTA", "urun_cinsi": "PIRLANTA",
            "islem_birimi": "ADET", "miktar": miktar, "adet": int(miktar),
            "birim_fiyat": birim_fiyat, "odeme_tipi": odeme_tipi,
            "milyem": 0.0, "net_has": 0.0,
        }
        if uyari:
            sonuc["uyari"] = uyari
        return sonuc

    # 🪙 SENARYO 2: SARRAFİYE KONTROLÜ (Merkezi Config'den — Adet Bazlı)
    sarrafiye_kelimesi = next((k for k in SARRAFIYE_CONFIG.keys() if k in metin), None)
    if sarrafiye_kelimesi:
        # Adet ayrıştır — kelimeden önce veya sonra sayı ara
        adet_match = re.search(
            r"(\d+(?:\.\d+)?)\s*(?:adet|tane)?\s*" + sarrafiye_kelimesi, metin
        ) or re.search(
            sarrafiye_kelimesi + r"\s*(?:adet|tane)?\s*(\d+(?:\.\d+)?)", metin
        )

        uyari = None
        if adet_match:
            miktar = float(adet_match.group(1))
        else:
            miktar = 1.0
            uyari = f"Adet bulunamadı, 1 adet varsayıldı. Duyulan: {ham_metin}"
            print(f"  [UYARI] {uyari}")

        s_cfg = SARRAFIYE_CONFIG[sarrafiye_kelimesi]
        hesaplanan_has = round(miktar * s_cfg["has_karsiligi"], 4)
        sonuc = {
            "tip": "NORMAL_TX", "personel_id": personel_id, "islem_tipi": islem_tipi,
            "urun_kategorisi": "SARRAFIYE", "urun_cinsi": s_cfg["urun_cinsi"],
            "islem_birimi": "ADET", "miktar": miktar, "adet": int(miktar),
            "birim_fiyat": birim_fiyat, "odeme_tipi": odeme_tipi,
            "milyem": 0.0, "net_has": hesaplanan_has,
        }
        if uyari:
            sonuc["uyari"] = uyari
        return sonuc

    # 🏆 SENARYO 3: HAS ALTIN / HURDA (Mevcut Gramajlı Sistem)
    # 1. Önce "24 ayar" gibi kesin kalıpları arayalım ki ondalık sayılarla karışmasın
    ayar_match = re.search(r"\b(14|18|22|24)\s+ayar\b", metin)
    
    # 2. Eğer "ayar" kelimesini söylemediyse (örn: 10 gram 22 alış), 
    # sağında solunda nokta/virgül olmayan yalıtılmış bir ayar değeri arayalım
    if not ayar_match:
        ayar_match = re.search(r"(?<![.,\d])\b(14|18|22|24)\b(?![.,\d])", metin)

    if not ayar_match:
        return {"hata": f"Ürün kategorisi veya altın ayarı bulunamadı. Duyulan: {ham_metin}"}
    
    ayar_degeri = ayar_match.group(1)
    urun_cinsi = f"{ayar_degeri}_AYAR"
    
    # 3. Miktarı doğru bulmak için tespit ettiğimiz "Ayar" kelimesini ve sayısını cümleden çıkartalım
    metin_ayarsiz = metin[:ayar_match.start()] + metin[ayar_match.end():]
    
    # 4. Kalan metin içerisindeki ilk sayıyı (ondalıklı veya tam) miktar olarak alalım
    miktar_match = re.search(r"(\d+(?:[.,]\d+)?)", metin_ayarsiz)
    
    if not miktar_match:
        return {"hata": f"Miktar (gram) bulunamadı. Duyulan: {ham_metin}"}

    miktar = float(miktar_match.group(1).replace(",", "."))
    if miktar <= 0:
        return {"hata": f"Geçersiz miktar: {miktar}"}

    milyem = MILYEM_MAP.get(urun_cinsi, 0.0)
    hesaplanan_has = round(miktar * milyem, 4)

    print(f"  [Ayrıştırma]: tip={islem_tipi}, kategori=ALTIN, ayar={urun_cinsi}, miktar={miktar}gr, milyem={milyem}, odeme={odeme_tipi}")

    return {
        "tip": "NORMAL_TX",
        "personel_id": personel_id,
        "islem_tipi": islem_tipi,
        "urun_kategorisi": "ALTIN",
        "islem_birimi": "GRAM",
        "urun_cinsi": urun_cinsi,
        "miktar": miktar,
        "brut_miktar": miktar,   # geriye dönük uyumluluk
        "adet": 1,
        "birim_fiyat": birim_fiyat,
        "odeme_tipi": odeme_tipi,
        "milyem": milyem,
        "net_has": hesaplanan_has,
    }


# ─────────────────────────────────────────────
# VERİTABANI
# ─────────────────────────────────────────────
#
# MIGRATION SQL (İlk çalıştırmada bir kere manuel çalıştırın):
# ALTER TABLE islemler ADD COLUMN IF NOT EXISTS odeme_tipi VARCHAR(10) DEFAULT 'NAKIT';
# ALTER TABLE islemler ADD COLUMN IF NOT EXISTS adet INTEGER DEFAULT 1;
#
def veritabanina_yaz(islem: dict) -> bool:
    try:
        conn   = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO islemler
            (personel_id, islem_tipi, urun_kategorisi, islem_birimi, urun_cinsi,
             brut_miktar, milyem, birim_fiyat, net_has_miktar, odeme_tipi, adet)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                islem["personel_id"],
                islem["islem_tipi"],
                islem.get("urun_kategorisi", "ALTIN"),
                islem.get("islem_birimi", "GRAM"),
                islem["urun_cinsi"],
                islem["miktar"],
                islem.get("milyem", 0.0),
                islem.get("birim_fiyat", 0.0),
                islem["net_has"],
                islem.get("odeme_tipi", "NAKIT"),
                islem.get("adet", 1),
            ),
        )
        row = cursor.fetchone()

        if not row:
            raise Exception("Veritabanı id döndürmedi.")

        row_id = row[0]
        conn.commit()
        cursor.close()
        conn.close()

        uyari_mesaji = islem.get("uyari")
        if uyari_mesaji:
            print(f"  [UYARI] {uyari_mesaji}")

        payload = json.dumps({
            "type":       "NEW_TX",
            "id":         row_id,
            "tip":        islem["islem_tipi"],
            "kategori":   islem.get("urun_kategorisi", "ALTIN"),
            "birim":      islem.get("islem_birimi", "GRAM"),
            "miktar":     islem["miktar"],
            "adet":       islem.get("adet", 1),
            "ayar":       islem["urun_cinsi"],
            "has":        islem["net_has"],
            "odeme_tipi": islem.get("odeme_tipi", "NAKIT"),
            "uyari":      uyari_mesaji,
        }, ensure_ascii=False)

        broadcast_from_thread(payload)
        return True

    except Exception as e:
        print(f"  [DB HATA]: {e}")
        return False

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


def _query_islemler(conn, gunler=None, start_date=None, end_date=None, tip=None, personel_id=None, limit=None, odeme_tipi=None):
    cursor = conn.cursor()
    query = """
        SELECT
            i.id,
            i.islem_tarihi,
            i.islem_tipi,
            i.urun_cinsi,
            i.brut_miktar,
            i.net_has_miktar,
            i.birim_fiyat,
            COALESCE(p.ad_soyad, 'Bilinmiyor') AS personel_ad_soyad,
            i.personel_id,
            COALESCE(i.urun_kategorisi, 'ALTIN')  AS urun_kategorisi,
            COALESCE(i.islem_birimi,   'GRAM')    AS islem_birimi,
            COALESCE(i.odeme_tipi,     'NAKIT')   AS odeme_tipi,
            COALESCE(i.adet, 1)                   AS adet
        FROM islemler i
        LEFT JOIN personeller p ON p.id = i.personel_id
        WHERE 1=1
    """
    params = []

    # Dinamik Tarih Filtreleme
    if start_date and end_date:
        # Belirli iki tarih arası (Örn: 2023-01-01 ile 2023-01-10 arası)
        query += " AND i.islem_tarihi::date BETWEEN %s AND %s"
        params.extend([start_date, end_date])
    elif start_date:
        # Sadece belirli bir günden sonrası veya sadece o gün (Tek gün seçimi için end_date ile aynı gönderilir)
        query += " AND i.islem_tarihi::date = %s"
        params.append(start_date)
    elif gunler is not None:
        # Geleneksel "Son X gün" mantığı (Geriye dönük uyumluluk için)
        query += " AND i.islem_tarihi >= NOW() - (%s * INTERVAL '1 day')"
        params.append(gunler)

    if tip:
        query += " AND i.islem_tipi = %s"
        params.append(tip.upper())

    if personel_id is not None:
        query += " AND i.personel_id = %s"
        params.append(personel_id)

    if odeme_tipi:
        query += " AND COALESCE(i.odeme_tipi, 'NAKIT') = %s"
        params.append(odeme_tipi.upper())

    query += " ORDER BY i.islem_tarihi DESC"

    if limit:
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

@app.post("/islemler")
async def manuel_islem_ekle(payload: IslemPayload):
    """
    Frontend (Web) üzerinden manuel alış/satış işlemi ekler.
    Kategoriye göre (Altın, Sarrafiye, Pırlanta) has hesaplamasını dinamik yapar.
    """
    conn = None
    try:
        # 1. Veri Validasyonu
        islem_tipi = payload.islem_tipi.strip().upper()
        if islem_tipi not in ["ALIS", "SATIS"]:
            raise HTTPException(status_code=400, detail="Geçersiz işlem tipi.")

        urun_cinsi      = payload.urun_cinsi.strip().upper()
        urun_kategorisi = payload.urun_kategorisi.strip().upper()
        islem_birimi    = payload.islem_birimi.strip().upper()
        odeme_tipi      = payload.odeme_tipi.strip().upper() if payload.odeme_tipi else "NAKIT"
        if odeme_tipi not in ["NAKIT", "KART"]:
            raise HTTPException(status_code=400, detail="Geçersiz ödeme tipi. 'NAKIT' veya 'KART' olmalıdır.")
        adet = max(1, int(payload.adet))
        brut = float(payload.brut_miktar)

        milyem = 0.0
        hesaplanan_has = 0.0

        # 2. Kategoriye Göre Has Hesaplama — tek merkezi mantık
        if urun_kategorisi == "PIRLANTA":
            milyem = 0.0
            hesaplanan_has = 0.0

        elif urun_kategorisi == "SARRAFIYE":
            # Merkezi SARRAFIYE_CINSI_MAP kullan (tek kaynak)
            has_karsiligi = SARRAFIYE_CINSI_MAP.get(urun_cinsi)
            if has_karsiligi is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Geçersiz sarrafiye cinsi: {urun_cinsi}. "
                           f"Geçerli değerler: {list(SARRAFIYE_CINSI_MAP.keys())}"
                )
            hesaplanan_has = round(brut * has_karsiligi, 4)

        else:
            # Standart ALTIN / HURDA (Gram × Milyem)
            milyem = MILYEM_MAP.get(urun_cinsi)
            if milyem is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Geçersiz altın ayarı: {urun_cinsi}. "
                           f"Geçerli değerler: {list(MILYEM_MAP.keys())}"
                )
            hesaplanan_has = round(brut * milyem, 4)

        # 3. Veritabanına Yazma
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO islemler
            (personel_id, islem_tipi, urun_kategorisi, islem_birimi, urun_cinsi,
             brut_miktar, milyem, birim_fiyat, net_has_miktar, odeme_tipi, adet)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                payload.personel_id, islem_tipi, urun_kategorisi, islem_birimi,
                urun_cinsi, brut, milyem, payload.birim_fiyat, hesaplanan_has,
                odeme_tipi, adet,
            ),
        )
        row_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()

        # 4. WebSocket ile Anlık Bildirim
        ws_payload = json.dumps({
            "type":       "NEW_TX",
            "id":         row_id,
            "tip":        islem_tipi,
            "kategori":   urun_kategorisi,
            "birim":      islem_birimi,
            "miktar":     brut,
            "adet":       adet,
            "ayar":       urun_cinsi,
            "has":        hesaplanan_has,
            "odeme_tipi": odeme_tipi,
        }, ensure_ascii=False)
        await manager.broadcast_text(ws_payload)

        return {
            "id":             row_id,
            "mesaj":          "Manuel işlem başarıyla kaydedildi.",
            "net_has_miktar": hesaplanan_has,
            "odeme_tipi":     odeme_tipi,
        }

    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        print(f"❌ [MANUEL İŞLEM HATASI]: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
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
    gunler: int | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    tip: str | None = Query(None),
    personel_id: int | None = Query(None),
    limit: int | None = Query(None),
    odeme_tipi: str | None = Query(None),
):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        rows = _query_islemler(conn, gunler, start_date, end_date, tip, personel_id, limit, odeme_tipi)
        return [
            {
                "id":              r[0],
                "islem_tarihi":    r[1].isoformat() if r[1] else None,
                "islem_tipi":      r[2],
                "urun_cinsi":      r[3],
                "brut_miktar":     float(r[4]) if r[4] is not None else 0.0,
                "net_has_miktar":  float(r[5]) if r[5] is not None else 0.0,
                "birim_fiyat":     float(r[6]) if r[6] is not None else 0.0,
                "personel_ad_soyad": r[7],
                "personel_id":     r[8],
                "urun_kategorisi": r[9],
                "islem_birimi":    r[10],
                "odeme_tipi":      r[11],
                "adet":            int(r[12]) if r[12] is not None else 1,
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

@app.put("/islemler/{islem_id}")
async def islem_duzenle(islem_id: int, payload: IslemPayload):
    """İşlemi günceller. Sarrafiye/Pırlanta has hesabını da doğru yapar."""
    conn = None
    try:
        islem_tipi      = payload.islem_tipi.strip().upper()
        urun_cinsi      = payload.urun_cinsi.strip().upper()
        urun_kategorisi = payload.urun_kategorisi.strip().upper()
        odeme_tipi      = (payload.odeme_tipi or "NAKIT").strip().upper()
        brut            = float(payload.brut_miktar)
        adet            = max(1, int(payload.adet))

        milyem = 0.0
        hesaplanan_has = 0.0

        # Manuel endpoint ile aynı has hesaplama mantığı
        if urun_kategorisi == "PIRLANTA":
            hesaplanan_has = 0.0
        elif urun_kategorisi == "SARRAFIYE":
            has_karsiligi = SARRAFIYE_CINSI_MAP.get(urun_cinsi)
            if has_karsiligi is None:
                raise HTTPException(status_code=400, detail=f"Geçersiz sarrafiye cinsi: {urun_cinsi}")
            hesaplanan_has = round(brut * has_karsiligi, 4)
        else:
            milyem = MILYEM_MAP.get(urun_cinsi)
            if milyem is None:
                raise HTTPException(status_code=400, detail=f"Geçersiz altın ayarı: {urun_cinsi}")
            hesaplanan_has = round(brut * milyem, 4)

        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        cursor.execute("SELECT islem_tipi, net_has_miktar FROM islemler WHERE id = %s", (islem_id,))
        old_row = cursor.fetchone()
        if not old_row:
            raise HTTPException(status_code=404, detail="İşlem bulunamadı.")
        old_tip, old_has = old_row

        cursor.execute(
            """
            UPDATE islemler
            SET islem_tipi=%s, urun_kategorisi=%s, urun_cinsi=%s, brut_miktar=%s,
                milyem=%s, birim_fiyat=%s, net_has_miktar=%s, odeme_tipi=%s, adet=%s
            WHERE id=%s
            """,
            (islem_tipi, urun_kategorisi, urun_cinsi, brut,
             milyem, payload.birim_fiyat, hesaplanan_has, odeme_tipi, adet, islem_id)
        )
        conn.commit()
        cursor.close()

        ws_payload = json.dumps({
            "type":       "UPDATE_TX",
            "id":         islem_id,
            "tip":        islem_tipi,
            "miktar":     brut,
            "adet":       adet,
            "ayar":       urun_cinsi,
            "has":        hesaplanan_has,
            "odeme_tipi": odeme_tipi,
            "eski_tip":   old_tip,
            "eski_has":   float(old_has),
        }, ensure_ascii=False)
        await manager.broadcast_text(ws_payload)

        return {"mesaj": "İşlem başarıyla güncellendi", "net_has_miktar": hesaplanan_has}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

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
    def header(self):
        # Altın sarısı üst çizgi vurgusu
        self.set_fill_color(212, 175, 55) # #D4AF37
        self.rect(0, 0, 210, 4, style="F")
        self.set_y(10)

    def footer(self):
        self.set_y(-15)
        self.set_font("Corporate", "", 8)
        self.set_text_color(150, 150, 150)
        self.set_draw_color(230, 230, 230)
        self.line(10, self.get_y(), 200, self.get_y())
        self.cell(0, 5, "Bu rapor Çapar ERP sistemi tarafından otomatik oluşturulmuştur.", align="L")
        self.cell(0, 5, f"Sayfa {self.page_no()}", align="R")

@app.get("/rapor/pdf")
def generate_pdf_report(
    gunler: int | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    tip: str | None = Query(None),
    personel_id: int | None = Query(None),
):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        
        rows = _query_islemler(
            conn, 
            gunler=gunler, 
            start_date=start_date, 
            end_date=end_date, 
            tip=tip, 
            personel_id=personel_id, 
            limit=1000
        )
        
        toplam_alis  = sum(float(r[5] or 0) for r in rows if r[2] == "ALIS")
        toplam_satis = sum(float(r[5] or 0) for r in rows if r[2] == "SATIS")
        net_has = toplam_alis - toplam_satis

        kart_alis_tl   = sum(float(r[6] or 0) for r in rows if r[2] == "ALIS" and r[11] == "KART")
        kart_satis_tl  = sum(float(r[6] or 0) for r in rows if r[2] == "SATIS" and r[11] == "KART")
        nakit_alis_tl  = sum(float(r[6] or 0) for r in rows if r[2] == "ALIS" and r[11] == "NAKIT")
        nakit_satis_tl = sum(float(r[6] or 0) for r in rows if r[2] == "SATIS" and r[11] == "NAKIT")

        pdf = CorporatePDF()
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()

        font_candidates = [
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
        ]
        font_path = next((p for p in font_candidates if os.path.exists(p)), None)
        if not font_path:
            raise RuntimeError("Unicode font bulunamadı.")
        pdf.add_font("Corporate", "", font_path, uni=True)

        # --- BAŞLIK KISMI ---
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Corporate", "", 16)
        pdf.cell(0, 8, "ÇAPAR KUYUMCULUK", ln=1, align="L")
        
        pdf.set_font("Corporate", "", 10)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 5, "KURUMSAL ISLEM RAPORU", ln=1, align="L")
        
        # Tarih / Kapsam Bilgisi (Sağ Üstte Hizalama)
        if start_date and end_date and start_date != end_date:
            rapor_kapsami = f"{start_date} - {end_date}"
        elif start_date:
            rapor_kapsami = f"{start_date} (Tek Gün)"
        elif gunler:
            rapor_kapsami = f"Son {gunler} Gün"
        else:
            rapor_kapsami = "Tüm Islemler"

        # Y'yi tekrar yukarı alıp sağa yazdırıyoruz
        current_y = pdf.get_y()
        pdf.set_xy(10, 10)
        pdf.set_font("Corporate", "", 9)
        pdf.cell(0, 8, f"Kapsam: {rapor_kapsami}", ln=1, align="R")
        pdf.cell(0, 5, f"Çıktı Tarihi: {time.strftime('%d.%m.%Y %H:%M')}", ln=1, align="R")
        pdf.set_y(current_y + 8)

        # --- ÖZET KARTLARI (KPI) ---
        pdf.set_fill_color(248, 250, 252) # Hafif gri arka plan
        pdf.set_draw_color(226, 232, 240) # İnce gri çerçeve
        pdf.set_text_color(50, 50, 50)
        pdf.set_font("Corporate", "", 10)
        
        # 3 Kutucuk Yanyana
        pdf.cell(60, 12, f"Toplam Alış (Has): {toplam_alis:.3f} gr", border=1, fill=True, align="C")
        pdf.cell(5, 12, "", border=0) # Boşluk
        pdf.cell(60, 12, f"Toplam Satış (Has): {toplam_satis:.3f} gr", border=1, fill=True, align="C")
        pdf.cell(5, 12, "", border=0) # Boşluk
        
        # Net Has Kutusu (Altın Sarısı Çerçeveli)
        pdf.set_draw_color(212, 175, 55)
        pdf.set_fill_color(253, 250, 237)
        pdf.set_text_color(180, 130, 20)
        pdf.cell(60, 12, f"Net Has Bakiye: {net_has:.3f} gr", border=1, fill=True, ln=1, align="C")
        pdf.ln(10)

        pdf.set_font("Corporate", "", 9)

        # Nakit Kutusu (Yeşil Tonları)
        pdf.set_fill_color(236, 253, 245)
        pdf.set_draw_color(167, 243, 208)
        pdf.set_text_color(6, 95, 70)
        nakit_metin = f"Nakit Alış: {nakit_alis_tl:,.0f} TL  |  Nakit Satış: {nakit_satis_tl:,.0f} TL".replace(",", ".")
        pdf.cell(92, 10, nakit_metin, border=1, fill=True, align="C")

        pdf.cell(6, 10, "", border=0) # İki kutu arası yatay boşluk

        # Kart Kutusu (Mavi Tonları)
        pdf.set_fill_color(239, 246, 255)
        pdf.set_draw_color(191, 219, 254)
        pdf.set_text_color(30, 64, 175)
        kart_metin = f"Kartlı Alış: {kart_alis_tl:,.0f} TL  |  Kartlı Satış: {kart_satis_tl:,.0f} TL".replace(",", ".")
        pdf.cell(92, 10, kart_metin, border=1, fill=True, align="C", ln=1)

        pdf.ln(8) # Tablo öncesi boşluk

        # --- TABLO BAŞLIKLARI ---
        headers = ["Tarih", "Personel", "İşlem", "Ürün", "Miktar", "Has (gr)", "Tutar", "Ödeme Türü"]
        # Toplam genişlik = 190mm
        widths  = [26, 30, 16, 22, 22, 20, 32, 22] 
        
        pdf.set_fill_color(241, 245, 249) # Tablo başlık arkaplanı
        pdf.set_draw_color(203, 213, 225)
        pdf.set_text_color(71, 85, 105)
        pdf.set_font("Corporate", "", 9)
        
        for i, h in enumerate(headers):
            pdf.cell(widths[i], 9, h, border="B", align="L" if i < 4 else "R", fill=True)
        pdf.ln()

        # --- TABLO İÇERİĞİ ---
        pdf.set_font("Corporate", "", 8)
        
        URUN_LABEL = { 
            '24_AYAR': '24 Ayar', '22_AYAR': '22 Ayar', '18_AYAR': '18 Ayar', '14_AYAR': '14 Ayar',
            'CEYREK_ALTIN': 'Çeyrek', 'YARIM_ALTIN': 'Yarim', 'TAM_ALTIN': 'Tam', 'ATA_ALTIN': 'Ata',
            'PIRLANTA': 'Pirlanta'
        }

        fill = False
        pdf.set_draw_color(241, 245, 249) # Çok ince satir alt çizgisi
        
        for row in rows:
            # row: [id, tarih, tip, cinsi, brut, net_has, fiyat, personel_ad, p_id, kategori, birim, odeme, adet]
            t_str = row[1].strftime("%d.%m.%Y %H:%M") if row[1] else "-"
            personel = str(row[7])
            tip = "Satış" if row[2] == "SATIS" else "Alış"
            urun = URUN_LABEL.get(row[3], str(row[3]))
            kategori = row[9]
            birim = row[10]
            odeme = "Kart" if row[11] == "KART" else "Nakit"
            
            # Dinamik Miktar Formatı (Adet vs Gram)
            miktar_val = float(row[4] or 0)
            if birim == "ADET":
                miktar_str = f"{int(miktar_val)} Adet"
            else:
                miktar_str = f"{miktar_val:.2f} gr"
                
            # Dinamik Has Formatı (Pırlanta ise tire çek)
            if kategori == "PIRLANTA":
                has_str = "-"
            else:
                has_str = f"{float(row[5] or 0):.3f}"
                
            # Tutar Formatı (Binlik ayraçlı)
            fiyat_val = float(row[6] or 0)
            if fiyat_val > 0:
                fiyat_str = f"{fiyat_val:,.2f} TL".replace(",", "X").replace(".", ",").replace("X", ".")
            else:
                fiyat_str = "-"

            vals = [t_str, personel, tip, urun, miktar_str, has_str, fiyat_str, odeme]
            
            # Alış ve Satışa göre renk kodlaması (Sadece "İşlem" hücresinde metin rengi)
            pdf.set_fill_color(248, 250, 252) if fill else pdf.set_fill_color(255, 255, 255)
            
            for i, val in enumerate(vals):
                if i == 2: # İşlem Sütunu Renklendirme
                    if tip == "Alış":
                        pdf.set_text_color(16, 185, 129) # Zümrüt Yeşili
                    else:
                        pdf.set_text_color(239, 68, 68) # Kırmızı
                else:
                    pdf.set_text_color(51, 65, 85) # Standart Koyu Gri

                align = "L" if i < 4 else "R"
                pdf.cell(widths[i], 8, val, border="B", align=align, fill=fill)
            
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