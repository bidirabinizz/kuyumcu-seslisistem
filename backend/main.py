import asyncio
import json
import os
import queue
import re
import threading
import time
import warnings
import winsound
from contextlib import asynccontextmanager
from fpdf import FPDF
from fastapi.responses import FileResponse
import psycopg2
import sounddevice as sd
import speech_recognition as sr
import whisper
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from vosk import KaldiRecognizer, Model
from fastapi.middleware.cors import CORSMiddleware



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

WAKE_WORDS = ["ahmet", "zeynep", "kasa"]

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
# WEBSOCKET YÖNETİCİSİ
# ─────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        broken = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                broken.append(ws)
        for ws in broken:
            self.disconnect(ws)


manager = ConnectionManager()
_main_loop: asyncio.AbstractEventLoop | None = None


# ─────────────────────────────────────────────
# UYGULAMA YAŞAM DÖNGÜSÜ
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    t = threading.Thread(target=ai_motorunu_baslat, daemon=True)
    t.start()
    yield


app = FastAPI(title="Kuyumcu ERP API", lifespan=lifespan)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Sadece bizim frontend'e izin ver
    allow_credentials=True,
    allow_methods=["*"], # Tüm metodlara (GET, POST, OPTIONS vb.) izin ver
    allow_headers=["*"], # Tüm başlıklara izin ver
)

# ─────────────────────────────────────────────
# WEBSOCKET ENDPOINT
# ─────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/")
def read_root():
    return {"durum": "çalışıyor"}

@app.get("/rapor/pdf")
def generate_pdf_report():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Son 50 işlemi çekiyoruz
        cursor.execute("""
            SELECT islem_tarihi, islem_tipi, urun_cinsi, brut_miktar, net_has_miktar 
            FROM islemler 
            ORDER BY islem_tarihi DESC LIMIT 50
        """)
        rows = cursor.fetchall()

        # PDF Ayarları
        pdf = FPDF()
        pdf.add_page()
        # Not: Türkçe karakterler için font eklemek gerekir. 
        # Şimdilik standart font kullanıyoruz, karakter hatası alırsan font yüklemeliyiz.
        pdf.set_font("Arial", 'B', 16)
        pdf.cell(190, 10, "CAPAR KUYUMCULUK - ISLEM RAPORU", ln=True, align='C')
        pdf.ln(10)

        # Tablo Başlıkları
        pdf.set_font("Arial", 'B', 10)
        pdf.cell(45, 10, "Tarih", border=1)
        pdf.cell(25, 10, "Tip", border=1)
        pdf.cell(40, 10, "Cins", border=1)
        pdf.cell(40, 10, "Brut Gram", border=1)
        pdf.cell(40, 10, "Has Miktar", border=1)
        pdf.ln()

        # Tablo Verileri
        pdf.set_font("Arial", '', 10)
        for row in rows:
            pdf.cell(45, 10, str(row[0].strftime("%d-%m-%Y %H:%M")), border=1)
            pdf.cell(25, 10, str(row[1]), border=1)
            pdf.cell(40, 10, str(row[2]), border=1)
            pdf.cell(40, 10, str(row[3]), border=1)
            pdf.cell(40, 10, str(row[4]), border=1)
            pdf.ln()

        report_path = "islem_raporu.pdf"
        pdf.output(report_path)
        
        cursor.close()
        conn.close()
        
        return FileResponse(report_path, filename="Capar_Kuyumculuk_Rapor.pdf")
    except Exception as e:
        print(f"PDF Hatası: {e}")
        return {"hata": str(e)}

# ─────────────────────────────────────────────
# THREAD → EVENT LOOP KÖPRÜSÜ
# ─────────────────────────────────────────────
def broadcast_from_thread(payload: str):
    """AI thread'inden FastAPI event loop'una güvenli broadcast."""
    if _main_loop is None:
        return
    asyncio.run_coroutine_threadsafe(manager.broadcast(payload), _main_loop)


# ─────────────────────────────────────────────
# METİN İŞLEME
# ─────────────────────────────────────────────
def metni_temizle(metin: str) -> str:
    return metin.replace(",", ".").replace("-", " ").strip().lower()


def metni_sayiya_dok(metin: str) -> str:
    """'yirmi iki' → '22' dönüşümü yapar."""
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
    print(f"  [İşlenen metin] : {metin}")

    # İşlem tipi
    if "alış" in metin or "alıs" in metin:
        islem_tipi = "ALIS"
    elif "satış" in metin or "satis" in metin:
        islem_tipi = "SATIS"
    else:
        return {"hata": "İşlem tipi (Alış/Satış) bulunamadı."}

    # Ayar
    ayar_match = re.search(r"\b(14|18|22|24)\b", metin)
    if not ayar_match:
        return {"hata": "Geçerli altın ayarı (14, 18, 22, 24) bulunamadı."}

    ayar_degeri = ayar_match.group(1)
    urun_cinsi  = f"{ayar_degeri}_AYAR"
    fiyat_match = re.search(r"(?:fiyat|tutar|lira)\s*(\d+(?:\.\d+)?)", metin)
    birim_fiyat = float(fiyat_match.group(1)) if fiyat_match else 0.0
    # Miktar — ayar rakamını metinden çıkardıktan sonra ara
    kalan = metin.replace(ayar_degeri, "", 1)
    miktar_match = re.search(r"(\d+(?:[.,]\d+)?)", kalan)
    if not miktar_match:
        return {"hata": "Gramaj (miktar) bulunamadı."}

    brut_miktar = float(miktar_match.group(1).replace(",", "."))
    milyem      = MILYEM_MAP.get(urun_cinsi, 0.0)

    return {
        "personel_id": personel_id,
        "islem_tipi": islem_tipi,
        "urun_cinsi": urun_cinsi,
        "brut_miktar": brut_miktar,
        "birim_fiyat": birim_fiyat, # Yeni alan
        "milyem": milyem
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
            INSERT INTO islemler (personel_id, islem_tipi, urun_cinsi, brut_miktar, milyem)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING net_has_miktar;
            """,
            (
                islem["personel_id"],
                islem["islem_tipi"],
                islem["urun_cinsi"],
                islem["brut_miktar"],
                islem["milyem"],
            ),
        )
        net_has = float(cursor.fetchone()[0])
        conn.commit()
        cursor.close()
        conn.close()

        print(f"\n  ✓ KASAYA İŞLENDİ")
        print(f"  {islem['brut_miktar']} gr  {islem['urun_cinsi']}  →  {islem['islem_tipi']}")
        print(f"  Has altın etkisi : {net_has} gr\n")

        payload = json.dumps(
            {
                "tip"   : islem["islem_tipi"],
                "miktar": islem["brut_miktar"],
                "ayar"  : islem["urun_cinsi"],
                "has"   : net_has,
            },
            ensure_ascii=False,
        )
        broadcast_from_thread(payload)

    except Exception as e:
        print(f"  [DB HATA]: {e}")


# ─────────────────────────────────────────────
# AI MOTORU  (daemon thread)
# ─────────────────────────────────────────────
def ai_motorunu_baslat():
    print("[AI] Modeller yükleniyor...")

    try:
        vosk_model    = Model("model")
        whisper_model = whisper.load_model("small")
    except Exception as e:
        print(f"[AI BAŞLATMA HATASI]: {e}")
        return

    recognizer    = KaldiRecognizer(vosk_model, 16000)
    sr_recognizer = sr.Recognizer()
    ses_q         = queue.Queue()
    son_tetik     = 0.0

    def mikrofon_callback(indata, frames, zaman, status):
        ses_q.put(bytes(indata))

    print("[SİSTEM AKTİF] Wake word bekleniyor...\n")

    while True:
        # ── AŞAMA 1: Vosk — wake word ──────────────────────────────
        wake_kelime = None

        with sd.RawInputStream(
            samplerate=16000, blocksize=8000,
            dtype="int16", channels=1,
            callback=mikrofon_callback,
        ):
            while wake_kelime is None:
                data = ses_q.get()

                if recognizer.AcceptWaveform(data):
                    metin = json.loads(recognizer.Result()).get("text", "")
                else:
                    metin = json.loads(recognizer.PartialResult()).get("partial", "")

                if not metin:
                    continue

                for kw in WAKE_WORDS:
                    if kw in metin:
                        simdi = time.time()
                        if simdi - son_tetik < COOLDOWN_SANIYE:
                            break          # cooldown dolmadı
                        son_tetik = simdi
                        wake_kelime = kw
                        recognizer.Reset()
                        print(f"  [*] '{kw.upper()}' algılandı.")
                        break

        # Kuyrukta kalan eski ses verisini temizle
        while not ses_q.empty():
            try:
                ses_q.get_nowait()
            except queue.Empty:
                break

        # ── AŞAMA 2: Whisper — komut ────────────────────────────────
        try:
            with sr.Microphone() as source:
                sr_recognizer.adjust_for_ambient_noise(source, duration=0.3)
                print("  [BİİP] >>> KONUŞUN <<<")
                winsound.Beep(1000, 300)

                audio = sr_recognizer.listen(
                    source,
                    timeout=15,
                    phrase_time_limit=12,
                )
                print("  Analiz ediliyor...")

            with open(TEMP_WAV, "wb") as f:
                f.write(audio.get_wav_data())

            result    = whisper_model.transcribe(
                TEMP_WAV,
                language="tr",
                fp16=False,
                initial_prompt=WHISPER_PROMPT,
            )
            ham_metin = result["text"].strip()
            print(f"  [Duyulan] : '{ham_metin}'")

            islem = sesli_komutu_ayristir(ham_metin, personel_id=1)

            if "hata" not in islem:
                veritabanina_yaz(islem)
                winsound.Beep(1200, 200)   # başarı
            else:
                winsound.Beep(400, 600)    # hata
                print(f"  [HATA] {islem['hata']}")

        except sr.WaitTimeoutError:
            print("  [ZAMAN AŞIMI] Ses algılanamadı.")
            winsound.Beep(400, 300)
        except Exception as e:
            print(f"  [WHISPER HATA]: {e}")
        finally:
            if os.path.exists(TEMP_WAV):
                os.remove(TEMP_WAV)

        print("  [UYKU] Wake word bekleniyor...\n")