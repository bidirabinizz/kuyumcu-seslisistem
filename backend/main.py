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
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    try:
        personel_tetikleme_haritasi_yenile()
        print(f"[AI] Wake word havuzu yüklendi: {list(aktif_tetikleme_haritasi().keys())}")
    except Exception as e:
        print(f"[UYARI] Personel wake word havuzu yüklenemedi: {e}")
    t = threading.Thread(target=ai_motorunu_baslat, daemon=True)
    t.start()
    yield


app = FastAPI(title="Kuyumcu ERP API", lifespan=lifespan)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Sadece bizim frontend'e izin ver
    allow_credentials=True,
    allow_methods=["*"], # Tüm metodlara (GET, POST, OPTIONS vb.) izin ver
    allow_headers=["*"], # Tüm başlıklara izin ver
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
            SELECT column_name
            FROM information_schema.columns
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
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, tetikleme_kelimesi
            FROM personeller
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
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def aktif_tetikleme_haritasi():
    with _wake_words_lock:
        return dict(_wake_words_map)


class CorporatePDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Corporate", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 5, "Bu rapor Çapar ERP sistemi tarafından otomatik oluşturulmuştur.", align="L")
        self.cell(0, 5, f"Sayfa {self.page_no()}", align="R")


def _parse_decimal(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value.strip().replace(",", "."))
    except Exception:
        return None

def sistem_biipi(frekans, sure):
    """Platforma göre uyarı sesi çalar."""
    if platform.system() == "Windows":
        import winsound
        winsound.Beep(frekans, sure)
    else:
        # Linux için terminal zil sesini (ASCII bell) kullanır
        # Not: Terminal ayarlarınıza bağlı olarak ses çıkmayabilir.
        print("\a", end="", flush=True)

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

    def trend(key: str):
        old = previous.get(key)
        new = current.get(key)
        if old is None or new is None:
            return "same"
        if new > old:
            return "up"
        if new < old:
            return "down"
        return "same"

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
        raise RuntimeError("TCMB kur verisi okunamadi.")

    # XAU verisi mevcutsa ons bazli kabul edip gram 24K fiyatina cevir.
    if xau_value is not None and xau_value > 0:
        gram_altin_24k_try = xau_value / 31.1035
    else:
        # TCMB XML'de XAU eksikse makul bir fallback yaklasimi.
        approx_ons_usd = 2300.0
        gram_altin_24k_try = (approx_ons_usd * usd_try) / 31.1035

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


def _query_islemler(conn, gunler: int, tip: str | None = None, personel_id: int | None = None, limit: int | None = None):
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


def _tts_konus(metin: str):
    global _tts_engine
    try:
        with _tts_lock:
            if _tts_engine is None:
                _tts_engine = pyttsx3.init()
                _tts_engine.setProperty("rate", 165)
            _tts_engine.say(metin)
            _tts_engine.runAndWait()
    except Exception as e:
        print(f"[TTS UYARI]: {e}")


@app.get("/personeller/istatistik")
def personel_istatistikleri():
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                p.id,
                p.ad_soyad,
                p.tetikleme_kelimesi,
                p.rol,
                COALESCE(SUM(CASE WHEN i.islem_tipi = 'ALIS' THEN i.net_has_miktar ELSE 0 END), 0) AS toplam_alis_has,
                COALESCE(SUM(CASE WHEN i.islem_tipi = 'SATIS' THEN i.net_has_miktar ELSE 0 END), 0) AS toplam_satis_has,
                COALESCE(SUM(COALESCE(i.brut_miktar, 0) * COALESCE(i.birim_fiyat, 0)), 0) AS toplam_tl_hacim,
                COUNT(i.id) AS islem_sayisi
            FROM personeller p
            LEFT JOIN islemler i ON i.personel_id = p.id
            GROUP BY p.id, p.ad_soyad, p.tetikleme_kelimesi, p.rol
            ORDER BY p.id ASC
            """
        )
        rows = cursor.fetchall()

        result = []
        for r in rows:
            alis = float(r[4] or 0)
            satis = float(r[5] or 0)
            islem_sayisi = int(r[7] or 0)
            performans_skor = min(100, round(islem_sayisi * 2.5, 1))
            result.append(
                {
                    "id": r[0],
                    "ad_soyad": r[1],
                    "tetikleme_kelimesi": r[2],
                    "rol": r[3],
                    "toplam_alis_has": alis,
                    "toplam_satis_has": satis,
                    "net_has": alis - satis,
                    "toplam_tl_hacim": float(r[6] or 0),
                    "islem_sayisi": islem_sayisi,
                    "performans_skor": performans_skor,
                }
            )
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Personel istatistikleri getirilemedi: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()




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


@app.get("/personeller")
def personelleri_getir():
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, ad_soyad, tetikleme_kelimesi, rol
            FROM personeller
            ORDER BY id ASC
            """
        )
        rows = cursor.fetchall()
        return [
            {"id": r[0], "ad_soyad": r[1], "tetikleme_kelimesi": r[2], "rol": r[3]}
            for r in rows
        ]
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Personeller getirilemedi: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.post("/personeller")
def personel_ekle(payload: PersonelPayload):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO personeller (ad_soyad, tetikleme_kelimesi, rol)
            VALUES (%s, %s, %s)
            RETURNING id, ad_soyad, tetikleme_kelimesi, rol
            """,
            (
                payload.ad_soyad.strip(),
                normalize_tetikleme_kelimesi(payload.tetikleme_kelimesi),
                payload.rol.strip(),
            ),
        )
        row = cursor.fetchone()
        conn.commit()
        personel_tetikleme_haritasi_yenile()
        return {"id": row[0], "ad_soyad": row[1], "tetikleme_kelimesi": row[2], "rol": row[3]}
    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Bu tetikleme kelimesi zaten kullanılıyor.")
    except RuntimeError as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Personel eklenemedi: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.put("/personeller/{personel_id}")
def personel_guncelle(personel_id: int, payload: PersonelPayload):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE personeller
            SET ad_soyad = %s, tetikleme_kelimesi = %s, rol = %s
            WHERE id = %s
            RETURNING id, ad_soyad, tetikleme_kelimesi, rol
            """,
            (
                payload.ad_soyad.strip(),
                normalize_tetikleme_kelimesi(payload.tetikleme_kelimesi),
                payload.rol.strip(),
                personel_id,
            ),
        )
        row = cursor.fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Personel bulunamadı.")
        conn.commit()
        personel_tetikleme_haritasi_yenile()
        return {"id": row[0], "ad_soyad": row[1], "tetikleme_kelimesi": row[2], "rol": row[3]}
    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Bu tetikleme kelimesi zaten kullanılıyor.")
    except HTTPException:
        raise
    except RuntimeError as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Personel güncellenemedi: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.delete("/personeller/{personel_id}")
def personel_sil(personel_id: int):
    conn = None
    cursor = None
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
    except RuntimeError as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Personel silinemedi: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.get("/islemler")
def islemleri_getir(
    gunler: int = Query(30, ge=1, le=365),
    tip: str | None = Query(None),
    personel_id: int | None = Query(None),
    limit: int | None = Query(None, ge=1, le=500),
):
    conn = None
    cursor = None
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
        if conn:
            conn.close()


@app.get("/piyasa/kurlar")
def piyasa_kurlari():
    try:
        return _get_market_data_cached()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Piyasa verisi alınamadı: {e}")


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

        toplam_alis = sum(float(r[5] or 0) for r in rows if r[2] == "ALIS")
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
            raise RuntimeError("Unicode font bulunamadi (DejaVuSans/Arial).")
        pdf.add_font("Corporate", "", font_path)
        pdf.set_font("Corporate", "", 11)

        # Header
        pdf.set_text_color(25, 25, 25)
        pdf.set_font("Corporate", "", 15)
        pdf.cell(0, 10, "ÇAPAR KUYUMCULUK - KURUMSAL İŞLEM RAPORU", ln=1, align="C")
        pdf.set_font("Corporate", "", 10)
        pdf.cell(0, 6, f"Rapor Tarihi: {time.strftime('%d.%m.%Y %H:%M')}", ln=1, align="R")
        pdf.ln(2)

        # Summary box
        pdf.set_fill_color(245, 245, 245)
        pdf.set_draw_color(220, 220, 220)
        pdf.rect(10, pdf.get_y(), 190, 20, style="DF")
        y0 = pdf.get_y() + 4
        pdf.set_xy(14, y0)
        pdf.cell(58, 6, f"Toplam Alış (Has): {toplam_alis:.3f} gr", ln=0)
        pdf.cell(58, 6, f"Toplam Satış (Has): {toplam_satis:.3f} gr", ln=0)
        pdf.cell(58, 6, f"Net Has Bakiye: {net_has:.3f} gr", ln=1)
        pdf.ln(14)

        # Table header
        headers = ["Tarih", "Personel", "Tip", "Ayar", "Brut (gr)", "Has (gr)", "Birim Fiyat"]
        widths = [32, 38, 18, 22, 24, 24, 30]
        pdf.set_fill_color(230, 230, 230)
        pdf.set_font("Corporate", "", 9)
        for i, h in enumerate(headers):
            pdf.cell(widths[i], 8, h, border=1, align="C", fill=True)
        pdf.ln()

        # Zebra rows
        pdf.set_font("Corporate", "", 8)
        fill = False
        for row in rows:
            t_str = row[1].strftime("%d.%m.%Y %H:%M") if row[1] else "-"
            vals = [
                t_str,
                str(row[7]),
                str(row[2]),
                str(row[3]),
                f"{float(row[4] or 0):.3f}",
                f"{float(row[5] or 0):.3f}",
                f"{float(row[6] or 0):.2f}",
            ]
            if fill:
                pdf.set_fill_color(248, 248, 248)
            else:
                pdf.set_fill_color(255, 255, 255)
            for i, val in enumerate(vals):
                align = "R" if i >= 4 else "L"
                pdf.cell(widths[i], 7, val, border=1, align=align, fill=fill)
            pdf.ln()
            fill = not fill

        report_path = f"islem_raporu_{int(time.time())}.pdf"
        pdf.output(report_path)

        return FileResponse(report_path, filename="Capar_Kuyumculuk_Kurumsal_Rapor.pdf")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF olusturulamadi: {e}")
    finally:
        if conn:
            conn.close()

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
            INSERT INTO islemler (personel_id, islem_tipi, urun_cinsi, brut_miktar, milyem, birim_fiyat)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING net_has_miktar;
            """,
            (
                islem["personel_id"],
                islem["islem_tipi"],
                islem["urun_cinsi"],
                islem["brut_miktar"],
                islem["milyem"],
                islem["birim_fiyat"], # Burası 6. veri, yukarıya sütun ve %s ekledik
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
    son_yenileme  = 0.0
    son_bos_havuz_uyarisi = 0.0

    def mikrofon_callback(indata, frames, zaman, status):
        ses_q.put(bytes(indata))

    def onay_bekle(timeout_saniye: int = 8):
        baslangic = time.time()
        karar = None
        recognizer.Reset()
        while not ses_q.empty():
            try:
                ses_q.get_nowait()
            except queue.Empty:
                break

        with sd.RawInputStream(
            samplerate=16000, blocksize=8000, dtype="int16", channels=1, callback=mikrofon_callback
        ):
            while karar is None and (time.time() - baslangic) < timeout_saniye:
                data = ses_q.get()
                if recognizer.AcceptWaveform(data):
                    metin = json.loads(recognizer.Result()).get("text", "")
                else:
                    metin = json.loads(recognizer.PartialResult()).get("partial", "")

                m = metin.lower().strip()
                if not m:
                    continue
                if "onay" in m:
                    karar = "ONAY"
                elif "iptal" in m:
                    karar = "IPTAL"
        recognizer.Reset()
        return karar

    print("[SİSTEM AKTİF] Wake word bekleniyor...\n")

    while True:
        simdi = time.time()
        if simdi - son_yenileme >= 5:
            try:
                personel_tetikleme_haritasi_yenile()
            except Exception as e:
                print(f"[UYARI] Wake word havuzu yenilenemedi: {e}")
            son_yenileme = simdi

        wake_map = aktif_tetikleme_haritasi()
        if not wake_map:
            if simdi - son_bos_havuz_uyarisi >= 10:
                print("[UYARI] personeller tablosunda aktif tetikleme kelimesi bulunamadı.")
                son_bos_havuz_uyarisi = simdi
            time.sleep(1)
            continue

        # ── AŞAMA 1: Vosk — wake word ──────────────────────────────
        wake_kelime = None
        algilanan_personel_id = None

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

                for kw, pid in wake_map.items():
                    if kw in metin:
                        simdi = time.time()
                        if simdi - son_tetik < COOLDOWN_SANIYE:
                            break          # cooldown dolmadı
                        son_tetik = simdi
                        wake_kelime = kw
                        algilanan_personel_id = pid
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
                sistem_biipi(1000, 300)

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

            islem = sesli_komutu_ayristir(ham_metin, personel_id=algilanan_personel_id)

            if "hata" not in islem:
                tip_metin = "alış" if islem["islem_tipi"] == "ALIS" else "satış"
                ayar_metin = islem["urun_cinsi"].replace("_AYAR", " ayar")
                onay_metni = f"{islem['brut_miktar']} gram {ayar_metin} {tip_metin}, onaylıyor musunuz?"
                print(f"  [ONAY] {onay_metni}")
                _tts_konus(onay_metni)

                karar = onay_bekle(timeout_saniye=8)
                if karar == "ONAY":
                    veritabanina_yaz(islem)
                    sistem_biipi(1200, 200)   # başarı
                else:
                    sistem_biipi(500, 350)   # iptal / timeout
                    print("  [İPTAL] Komut iptal edildi veya onay alınamadı.")
            else:
                sistem_biipi(400, 600)   # hata
                print(f"  [HATA] {islem['hata']}")

        except sr.WaitTimeoutError:
            print("  [ZAMAN AŞIMI] Ses algılanamadı.")
            sistem_biipi(400, 300)
        except Exception as e:
            print(f"  [WHISPER HATA]: {e}")
        finally:
            if os.path.exists(TEMP_WAV):
                os.remove(TEMP_WAV)

        print("  [UYKU] Wake word bekleniyor...\n")