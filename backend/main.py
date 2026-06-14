import asyncio
import json
import os
import threading
import traceback
from contextlib import asynccontextmanager
from fpdf import FPDF
from fastapi.responses import FileResponse
import psycopg2
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import socket
import time
import urllib.request
import xml.etree.ElementTree as ET

# ─────────────────────────────────────────────
# AYARLAR
# ─────────────────────────────────────────────
from urllib.parse import urlparse

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    result = urlparse(DATABASE_URL)
    DB_CONFIG = {
        "dbname": result.path[1:],
        "user": result.username,
        "password": result.password,
        "host": result.hostname,
        "port": str(result.port or 5432),
    }
else:
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

    async def broadcast_text(self, message: str):
        """Tüm bağlı istemcilere metin yayınlar."""
        for p_id, ws in list(self.active_connections.items()):
            try:
                await ws.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()

_main_loop: asyncio.AbstractEventLoop | None = None
_schema_lock = threading.Lock()
_personeller_schema_checked = False
_market_cache_lock = threading.Lock()
_market_cache_data: dict | None = None
_market_cache_prev_data: dict | None = None
_market_cache_ts = 0.0
_MARKET_CACHE_TTL = 300

# ─────────────────────────────────────────────
# ─────────────────────────────────────────────
# UDP BROADCAST — Yerel Ağda Sunucu Keşfi
# ─────────────────────────────────────────────
UDP_BROADCAST_PORT = 55780
UDP_BROADCAST_MSG  = b"KUYUMCU_ERP_SERVER"
UDP_BROADCAST_ACK  = b"KUYUMCU_ERP_ACK"
_udp_stop_event    = threading.Event()

def _udp_broadcast_listener():
    """UDP broadcast isteklerini dinler ve yerel IP ile yanıt verir."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.settimeout(1.0)
        try:
            sock.bind(('', UDP_BROADCAST_PORT))
            print(f"[UDP] Keşif servisi dinleniyor — port {UDP_BROADCAST_PORT}")
        except OSError as e:
            print(f"[UDP] Bind hatası: {e}")
            return
        while not _udp_stop_event.is_set():
            try:
                data, addr = sock.recvfrom(256)
                if data == UDP_BROADCAST_MSG:
                    local_ip = get_local_ip()
                    payload  = UDP_BROADCAST_ACK + b":" + local_ip.encode()
                    sock.sendto(payload, addr)
                    print(f"[UDP] Keşif yanıtı gönderildi → {addr[0]} (IP: {local_ip})")
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[UDP] Hata: {e}")

# UYGULAMA YAŞAM DÖNGÜSÜ
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop

    _main_loop = asyncio.get_running_loop()

    try:
        db_tablolari_hazirla()
        print("[DB] Tablolar başarıyla hazırlandı (urunler, toptancilar vb).")
    except Exception as e:
        print(f"[UYARI] Tablolar hazırlanamadı: {e}")

    # UDP keşif servisi — daemon thread olarak başlat
    _udp_stop_event.clear()
    udp_thread = threading.Thread(target=_udp_broadcast_listener, daemon=True)
    udp_thread.start()

    yield

    # Temizlik
    _udp_stop_event.set()


app = FastAPI(title="Kuyumcu ERP API", lifespan=lifespan)

# ─────────────────────────────────────────────
# GLOBAL EXCEPTION HANDLER — Crash Önleme
# ─────────────────────────────────────────────
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class GlobalErrorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            tb = traceback.format_exc()
            print(f"[GLOBAL HATA] {request.method} {request.url}\n{tb}")
            return JSONResponse(
                status_code=500,
                content={
                    "hata": "Sunucu tarafında beklenmedik bir hata oluştu.",
                    "detay": str(exc),
                    "tip": type(exc).__name__,
                },
            )

@app.exception_handler(Exception)
async def genel_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[EXCEPTION HANDLER] {request.url}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={
            "hata": "İşlem sırasında bir hata oluştu.",
            "detay": str(exc),
            "tip": type(exc).__name__,
        },
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"hata": exc.detail, "kod": exc.status_code},
    )

# Frontend bu adresi çağırıp IP'yi gösterecek
@app.get("/sistem/ip")
def get_server_ip():
    return {"ip": get_local_ip()}

app.add_middleware(GlobalErrorMiddleware)
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
    odeme_tipi: str = "NAKIT"   # "NAKIT", "KART", "USD", "EUR"
    adet: int = 1               # Sarrafiye ve pırlanta için adet
    # Dinamik ürünler için override alanları (urunler tablosundan gelir)
    milyem_override: float | None = None
    has_karsiligi_override: float | None = None
    urun_adi: str | None = None   # Görüntüleme için ürün adı
    doviz_tutar: float = 0.0      # Döviz tutarı (USD/EUR ise)
    doviz_kuru: float = 1.0       # Döviz kuru


class UrunPayload(BaseModel):
    ad: str
    urun_cinsi: str
    urun_kategorisi: str   # "ALTIN" | "SARRAFIYE" | "PIRLANTA"
    islem_birimi: str = "GRAM"
    milyem: float = 0.0
    has_karsiligi: float = 0.0
    renk: str = "amber"    # UI renk ipucu: amber | yellow | orange | red | purple | blue
    sira: int = 0
    aktif: bool = True
    urun_grubu: str | None = "Diğer"


class KategoriPayload(BaseModel):
    ad: str          # Örn: "BEYAZ_ALTIN"
    etiket: str      # Görüntüleme adı: "✨ Beyaz Altın"
    renk: str = "gray"
    sira: int = 0
    aktif: bool = True

class KategoriGuncellePayload(BaseModel):
    ad: str | None = None
    etiket: str | None = None
    renk: str | None = None
    sira: int | None = None
    aktif: bool | None = None


class UrunGuncellePayload(BaseModel):
    ad: str | None = None
    urun_cinsi: str | None = None
    urun_kategorisi: str | None = None
    islem_birimi: str | None = None
    milyem: float | None = None
    has_karsiligi: float | None = None
    renk: str | None = None
    sira: int | None = None
    aktif: bool | None = None
    urun_grubu: str | None = None


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


# ─────────────────────────────────────────────
# ÜRÜNLER TABLOSU — Otomatik Oluşturma & Seed
# ─────────────────────────────────────────────
def db_tablolari_hazirla():
    """Tüm gerekli DB tablolarını oluşturur (yoksa) ve varsayılan ürünleri ekler."""
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 1. Personeller Tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS personeller (
                id                 SERIAL PRIMARY KEY,
                ad_soyad           VARCHAR(100) NOT NULL,
                tetikleme_kelimesi VARCHAR(100) NOT NULL UNIQUE,
                rol                VARCHAR(50) DEFAULT 'PERSONEL'
            )
        """)
        
        # 2. Islemler Tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS islemler (
                id              SERIAL PRIMARY KEY,
                personel_id     INTEGER REFERENCES personeller(id) ON DELETE RESTRICT,
                islem_tipi      VARCHAR(50) NOT NULL,
                urun_kategorisi VARCHAR(100) DEFAULT 'ALTIN',
                islem_birimi    VARCHAR(50) DEFAULT 'GRAM',
                urun_cinsi      VARCHAR(100) NOT NULL,
                brut_miktar     NUMERIC(15,4) NOT NULL,
                milyem          NUMERIC(8,4) DEFAULT 0,
                birim_fiyat     NUMERIC(15,2) NOT NULL,
                net_has_miktar  NUMERIC(15,4) NOT NULL,
                odeme_tipi      VARCHAR(50) DEFAULT 'NAKIT',
                adet            INTEGER DEFAULT 1,
                doviz_tutar     NUMERIC(15,2) DEFAULT 0,
                doviz_kuru      NUMERIC(10,4) DEFAULT 1,
                islem_tarihi    TIMESTAMP DEFAULT NOW()
            )
        """)

        # 3. Urunler Tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS urunler (
                id              SERIAL PRIMARY KEY,
                ad              VARCHAR(100) NOT NULL,
                urun_cinsi      VARCHAR(50)  NOT NULL,
                urun_kategorisi VARCHAR(20)  NOT NULL,
                islem_birimi    VARCHAR(10)  DEFAULT 'GRAM',
                milyem          NUMERIC(8,4) DEFAULT 0,
                has_karsiligi   NUMERIC(8,4) DEFAULT 0,
                renk            VARCHAR(20)  DEFAULT 'amber',
                sira            INTEGER      DEFAULT 0,
                aktif           BOOLEAN      DEFAULT TRUE,
                created_at      TIMESTAMP    DEFAULT NOW()
            )
        """)
        cursor.execute("""
            ALTER TABLE urunler ADD COLUMN IF NOT EXISTS urun_grubu VARCHAR(100) DEFAULT 'Diğer';
        """)
        
        # 4. Günlük Kurlar Tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS gunluk_kurlar (
                id                  SERIAL PRIMARY KEY,
                usd_try             NUMERIC(10,4) NOT NULL,
                eur_try             NUMERIC(10,4) NOT NULL,
                gram_altin_24k_try  NUMERIC(10,2) NOT NULL,
                guncellenme_tarihi  TIMESTAMP DEFAULT NOW()
            )
        """)
        
        # Geriye dönük uyumluluk ve güvenli alter işlemleri
        cursor.execute("""
            ALTER TABLE islemler ADD COLUMN IF NOT EXISTS doviz_tutar NUMERIC(15,2) DEFAULT 0;
        """)
        cursor.execute("""
            ALTER TABLE islemler ADD COLUMN IF NOT EXISTS doviz_kuru NUMERIC(10,4) DEFAULT 1;
        """)
        
        # 5. Kategoriler Tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS kategoriler (
                id      SERIAL PRIMARY KEY,
                ad      VARCHAR(100) NOT NULL UNIQUE,
                etiket  VARCHAR(100) NOT NULL,
                renk    VARCHAR(30)  DEFAULT 'amber',
                sira    INTEGER      DEFAULT 0,
                aktif   BOOLEAN      DEFAULT TRUE
            )
        """)
        
        # Kategoriler tablosunu varsayılan değerlerle seed et (yoksa)
        cursor.execute("SELECT COUNT(*) FROM kategoriler")
        kat_count = cursor.fetchone()[0]
        if kat_count == 0:
            varsayilan_kategoriler = [
                ('ALTIN',    '🥇 Altın',    'yellow', 1),
                ('SARRAFIYE','🪙 Sarrafiye', 'amber',  2),
                ('PIRLANTA', '💎 Pırlanta', 'purple', 3),
            ]
            cursor.executemany(
                "INSERT INTO kategoriler (ad, etiket, renk, sira) VALUES (%s, %s, %s, %s)",
                varsayilan_kategoriler
            )
            print(f"[DB] {len(varsayilan_kategoriler)} varsayılan kategori eklendi.")
            
        # urunler tablosunda urun_kategorisi kolonu VARCHAR(100) genişlet
        cursor.execute("""
            ALTER TABLE urunler 
            ALTER COLUMN urun_kategorisi TYPE VARCHAR(100);
        """)

        # 6. Toptancılar Tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS toptancilar (
                id                 SERIAL PRIMARY KEY,
                unvan              VARCHAR(200) NOT NULL,
                telefon            VARCHAR(50),
                aciklama           TEXT,
                olusturulma_tarihi TIMESTAMP DEFAULT NOW()
            )
        """)

        # 7. Toptancı İşlemler Tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS toptanci_islemler (
                id                 SERIAL PRIMARY KEY,
                toptanci_id        INTEGER NOT NULL REFERENCES toptancilar(id) ON DELETE CASCADE,
                islem_tipi         VARCHAR(50) NOT NULL, -- Örn: 'Borçlanma', 'Ödeme'
                islem_detayi       VARCHAR(100),         -- Örn: 'Nakit Ödeme', 'Hurda Teslimi', 'Has Altın Teslimi', 'Mal Alış'
                has_altin          NUMERIC(15,4) DEFAULT 0, -- Pozitif veya Negatif değer
                tl_tutar           NUMERIC(15,2) DEFAULT 0, -- Pozitif veya Negatif değer
                aciklama           TEXT,
                islem_tarihi       TIMESTAMP DEFAULT NOW()
            )
        """)

        # 8. Personeller Seed
        cursor.execute("SELECT COUNT(*) FROM personeller")
        p_count = cursor.fetchone()[0]
        if p_count == 0:
            cursor.execute(
                "INSERT INTO personeller (ad_soyad, tetikleme_kelimesi, rol) VALUES (%s, %s, %s)",
                ("Yönetici", "yönetici", "Yönetici")
            )
            print("[DB] Varsayılan personel eklendi.")

        # 9. Ürünler Seed
        cursor.execute("SELECT COUNT(*) FROM urunler")
        count = cursor.fetchone()[0]
        if count == 0:
            # Varsayılan ürünleri seed et (mevcut hardcode'larla birebir uyumlu)
            varsayilan = [
                ("24 Ayar Has",   "24_AYAR",      "ALTIN",     "GRAM", 1.0000, 0.0,    "yellow", 1),
                ("22 Ayar",       "22_AYAR",      "ALTIN",     "GRAM", 0.9160, 0.0,    "amber",  2),
                ("18 Ayar",       "18_AYAR",      "ALTIN",     "GRAM", 0.7500, 0.0,    "orange", 3),
                ("14 Ayar",       "14_AYAR",      "ALTIN",     "GRAM", 0.5850, 0.0,    "red",    4),
                ("Çeyrek Altın",  "CEYREK_ALTIN", "SARRAFIYE", "ADET", 0.0,    1.6030, "amber",  5),
                ("Yarım Altın",   "YARIM_ALTIN",  "SARRAFIYE", "ADET", 0.0,    3.2060, "amber",  6),
                ("Tam Altın",     "TAM_ALTIN",    "SARRAFIYE", "ADET", 0.0,    6.4120, "amber",  7),
                ("Ata Altın",     "ATA_ALTIN",    "SARRAFIYE", "ADET", 0.0,    6.5952, "amber",  8),
                ("Pırlanta",      "PIRLANTA",     "PIRLANTA",  "ADET", 0.0,    0.0,    "purple", 9),
            ]
            cursor.executemany(
                """INSERT INTO urunler
                   (ad, urun_cinsi, urun_kategorisi, islem_birimi, milyem, has_karsiligi, renk, sira)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                varsayilan
            )
            print(f"[DB] {len(varsayilan)} varsayılan ürün eklendi.")
        conn.commit()
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.websocket("/ws")
async def websocket_dashboard_endpoint(websocket: WebSocket, personel_id: int = Query(None)):
    """
    React Dashboard'un anlık Kasa güncellemelerini dinlemesi için WebSocket endpoint'i.
    Eğer bir personel paneli bağlanıyorsa query parametresi ile personel_id alır.
    """
    await websocket.accept()
    
    # Eğer personel_id gelmediyse (genel dashboard ise) yine benzersiz bir id verelim
    # Ama personel_id geldiyse doğrudan onu key yapalım ki /personeller/aktif doğru çalışsın!
    connection_key = personel_id if personel_id is not None else id(websocket)
    
    manager.active_connections[connection_key] = websocket
    print(f"🖥️ Bağlantı sağlandı! (ID/Personel ID: {connection_key})")
    
    try:
        while True:
            # Bağlantıyı açık tutmak için ping-pong dinlemesi
            await websocket.receive_text()
            
    except WebSocketDisconnect:
        if connection_key in manager.active_connections:
            del manager.active_connections[connection_key]
        print(f"❌ Bağlantı koptu. (ID/Personel ID: {connection_key})")
    except Exception as e:
        if connection_key in manager.active_connections:
            del manager.active_connections[connection_key]
        print(f"❌ Soket hatası: {e}")


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


def _get_market_data_cached():
    global _market_cache_data, _market_cache_prev_data, _market_cache_ts
    now = time.time()
    
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # gunluk_kurlar tablosunu kontrol et
        cursor.execute("SELECT COUNT(*) FROM gunluk_kurlar")
        count = cursor.fetchone()[0]
        
        if count == 0:
            # DB'de kur yoksa TCMB'den çekip kaydedelim (Seed)
            yeni = _fetch_market_data_from_tcmb()
            cursor.execute(
                "INSERT INTO gunluk_kurlar (usd_try, eur_try, gram_altin_24k_try) VALUES (%s, %s, %s)",
                (yeni["usd_try"], yeni["eur_try"], yeni["gram_altin_24k_try"])
            )
            conn.commit()
            yeni["kaynak"] = "TCMB (Otomatik Seed)"
            
            with _market_cache_lock:
                _market_cache_prev_data = _market_cache_data
                _market_cache_data = yeni
                _market_cache_ts = now
                return _market_with_trends(_market_cache_data, _market_cache_prev_data)
        else:
            # DB'deki kurları kullan
            cursor.execute("SELECT usd_try, eur_try, gram_altin_24k_try, guncellenme_tarihi FROM gunluk_kurlar LIMIT 1")
            r = cursor.fetchone()
            yeni = {
                "usd_try": float(r[0]),
                "eur_try": float(r[1]),
                "gram_altin_24k_try": float(r[2]),
                "guncellenme_ts": int(r[3].timestamp()) if r[3] else int(time.time()),
                "kaynak": "Kullanıcı Tanımlı (Yerel)",
            }
            
            with _market_cache_lock:
                _market_cache_prev_data = _market_cache_data
                _market_cache_data = yeni
                _market_cache_ts = now
                return _market_with_trends(_market_cache_data, _market_cache_prev_data)
    except Exception as e:
        print(f"[UYARI] DB'den kur çekilirken hata: {e}, TCMB'ye düşülüyor.")
        # Hata durumunda TCMB cache'ine düş
        with _market_cache_lock:
            if _market_cache_data and (now - _market_cache_ts) < _MARKET_CACHE_TTL:
                return _market_with_trends(_market_cache_data, _market_cache_prev_data)
        try:
            yeni = _fetch_market_data_from_tcmb()
            with _market_cache_lock:
                _market_cache_prev_data = _market_cache_data
                _market_cache_data = yeni
                _market_cache_ts = now
                return _market_with_trends(_market_cache_data, _market_cache_prev_data)
        except Exception as ex:
            raise ex
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


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
            COALESCE(i.adet, 1)                   AS adet,
            COALESCE(i.doviz_tutar, 0)            AS doviz_tutar,
            COALESCE(i.doviz_kuru, 1)             AS doviz_kuru
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


# ─────────────────────────────────────────────
# ÜRÜN YÖNETİMİ ENDPOINT'LERİ
# ─────────────────────────────────────────────
@app.get("/urunler")
def urunleri_getir(hepsi: bool = False):
    """Ürün listesini döner. hepsi=True ise pasif ürünleri de dahil eder."""
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        if hepsi:
            cursor.execute(
                "SELECT id, ad, urun_cinsi, urun_kategorisi, islem_birimi, "
                "milyem, has_karsiligi, renk, sira, aktif, COALESCE(urun_grubu, 'Diğer') FROM urunler ORDER BY sira ASC, id ASC"
            )
        else:
            cursor.execute(
                "SELECT id, ad, urun_cinsi, urun_kategorisi, islem_birimi, "
                "milyem, has_karsiligi, renk, sira, aktif, COALESCE(urun_grubu, 'Diğer') FROM urunler "
                "WHERE aktif = TRUE ORDER BY sira ASC, id ASC"
            )
        rows = cursor.fetchall()
        return [
            {
                "id": r[0], "ad": r[1], "urun_cinsi": r[2],
                "urun_kategorisi": r[3], "islem_birimi": r[4],
                "milyem": float(r[5]), "has_karsiligi": float(r[6]),
                "renk": r[7], "sira": r[8], "aktif": r[9],
                "urun_grubu": r[10]
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ürünler getirilemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.post("/urunler", status_code=201)
async def urun_ekle(payload: UrunPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO urunler
               (ad, urun_cinsi, urun_kategorisi, islem_birimi, milyem, has_karsiligi, renk, sira, aktif, urun_grubu)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (
                payload.ad.strip(), payload.urun_cinsi.strip().upper(),
                payload.urun_kategorisi.strip().upper(), payload.islem_birimi.strip().upper(),
                payload.milyem, payload.has_karsiligi,
                payload.renk, payload.sira, payload.aktif,
                (payload.urun_grubu or "Diğer").strip()
            )
        )
        new_id = cursor.fetchone()[0]
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_URUNLER"}))
        return {"id": new_id, "mesaj": "Ürün başarıyla eklendi."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Ürün eklenemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.put("/urunler/{urun_id}")
async def urun_guncelle(urun_id: int, payload: UrunGuncellePayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # Sadece gönderilen alanları güncelle
        alanlar = []
        degerler = []
        alan_map = {
            "ad": payload.ad, "urun_cinsi": payload.urun_cinsi,
            "urun_kategorisi": payload.urun_kategorisi,
            "islem_birimi": payload.islem_birimi, "milyem": payload.milyem,
            "has_karsiligi": payload.has_karsiligi, "renk": payload.renk,
            "sira": payload.sira, "aktif": payload.aktif,
            "urun_grubu": payload.urun_grubu
        }
        for alan, deger in alan_map.items():
            if deger is not None:
                alanlar.append(f"{alan} = %s")
                # String alanları büyük harfe çevir
                if alan in ("urun_cinsi", "urun_kategorisi", "islem_birimi") and isinstance(deger, str):
                    degerler.append(deger.strip().upper())
                else:
                    degerler.append(deger.strip() if isinstance(deger, str) else deger)

        if not alanlar:
            raise HTTPException(status_code=400, detail="Güncellenecek alan bulunamadı.")

        degerler.append(urun_id)
        cursor.execute(
            f"UPDATE urunler SET {', '.join(alanlar)} WHERE id = %s RETURNING id",
            tuple(degerler)
        )
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı.")
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_URUNLER"}))
        return {"mesaj": "Ürün güncellendi."}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Ürün güncellenemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.delete("/urunler/{urun_id}")
async def urun_sil(urun_id: int):
    """Ürünü tamamen siler. İşlem geçmişini korumak için aktif=False tercih edilir."""
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM urunler WHERE id = %s RETURNING id", (urun_id,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı.")
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_URUNLER"}))
        return {"mesaj": "Ürün silindi."}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Ürün silinemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ─────────────────────────────────────────────
# KATEGORİ YÖNETİMİ ENDPOINT'LERİ
# ─────────────────────────────────────────────
@app.get("/kategoriler")
def kategorileri_getir(hepsi: bool = False):
    """Tüm kategorileri döner. hepsi=True ise pasif kategorileri de dahil eder."""
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        if hepsi:
            cursor.execute("SELECT id, ad, etiket, renk, sira, aktif FROM kategoriler ORDER BY sira ASC, id ASC")
        else:
            cursor.execute("SELECT id, ad, etiket, renk, sira, aktif FROM kategoriler WHERE aktif = TRUE ORDER BY sira ASC, id ASC")
        rows = cursor.fetchall()
        return [
            {"id": r[0], "ad": r[1], "etiket": r[2], "renk": r[3], "sira": r[4], "aktif": r[5]}
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kategoriler getirilemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.post("/kategoriler", status_code=201)
async def kategori_ekle(payload: KategoriPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO kategoriler (ad, etiket, renk, sira, aktif) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (payload.ad.strip().upper(), payload.etiket.strip(), payload.renk.strip(), payload.sira, payload.aktif)
        )
        new_id = cursor.fetchone()[0]
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_KATEGORILER"}))
        return {"id": new_id, "mesaj": "Kategori başarıyla eklendi."}
    except Exception as e:
        if conn: conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Bu kategori kodu zaten mevcut.")
        raise HTTPException(status_code=500, detail=f"Kategori eklenemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.put("/kategoriler/{kategori_id}")
async def kategori_guncelle(kategori_id: int, payload: KategoriGuncellePayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        alanlar = []
        degerler = []
        if payload.ad is not None:
            alanlar.append("ad = %s")
            degerler.append(payload.ad.strip().upper())
        if payload.etiket is not None:
            alanlar.append("etiket = %s")
            degerler.append(payload.etiket.strip())
        if payload.renk is not None:
            alanlar.append("renk = %s")
            degerler.append(payload.renk.strip())
        if payload.sira is not None:
            alanlar.append("sira = %s")
            degerler.append(payload.sira)
        if payload.aktif is not None:
            alanlar.append("aktif = %s")
            degerler.append(payload.aktif)
        if not alanlar:
            raise HTTPException(status_code=400, detail="Güncellenecek alan bulunamadı.")
        degerler.append(kategori_id)
        cursor.execute(
            f"UPDATE kategoriler SET {', '.join(alanlar)} WHERE id = %s RETURNING id",
            tuple(degerler)
        )
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Kategori bulunamadı.")
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_KATEGORILER"}))
        return {"mesaj": "Kategori güncellendi."}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Kategori güncellenemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.delete("/kategoriler/{kategori_id}")
async def kategori_sil(kategori_id: int):
    """Kategoriyi siler. İçinde ürün varsa 409 hatası döner."""
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        # Önce bu kategoride ürün var mı kontrol et
        cursor.execute(
            "SELECT ad FROM kategoriler WHERE id = %s",
            (kategori_id,)
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Kategori bulunamadı.")
        kategori_adi = row[0]
        cursor.execute(
            "SELECT COUNT(*) FROM urunler WHERE UPPER(urun_kategorisi) = UPPER(%s)",
            (kategori_adi,)
        )
        urun_sayisi = cursor.fetchone()[0]
        if urun_sayisi > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Bu kategoride {urun_sayisi} ürün var. Önce ürünleri başka kategoriye taşıyın veya silin."
            )
        cursor.execute("DELETE FROM kategoriler WHERE id = %s", (kategori_id,))
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_KATEGORILER"}))
        return {"mesaj": "Kategori silindi."}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Kategori silinemedi: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


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
        if odeme_tipi not in ["NAKIT", "KART", "USD", "EUR"]:
            raise HTTPException(status_code=400, detail="Geçersiz ödeme tipi. 'NAKIT', 'KART', 'USD' veya 'EUR' olmalıdır.")
        adet = max(1, int(payload.adet))
        brut = float(payload.brut_miktar)

        milyem = 0.0
        hesaplanan_has = 0.0

        # 2. Kategoriye Göre Has Hesaplama — override varsa kullan, yoksa MILYEM_MAP
        if urun_kategorisi == "PIRLANTA":
            milyem = 0.0
            hesaplanan_has = 0.0

        elif urun_kategorisi == "SARRAFIYE":
            if payload.has_karsiligi_override is not None:
                # Dinamik üründen gelen has_karsiligi
                has_per = payload.has_karsiligi_override
            else:
                has_per = SARRAFIYE_CINSI_MAP.get(urun_cinsi)
                if has_per is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Geçersiz sarrafiye cinsi: {urun_cinsi}. "
                               f"Geçerli değerler: {list(SARRAFIYE_CINSI_MAP.keys())}"
                    )
            hesaplanan_has = round(brut * has_per, 4)

        else:
            # Standart ALTIN / HURDA (Gram × Milyem)
            if payload.milyem_override is not None:
                # Dinamik üründen gelen milyem
                milyem = payload.milyem_override
            else:
                milyem = MILYEM_MAP.get(urun_cinsi)
                if milyem is None:
                    # Bilinmeyen ayar için 0 milyem kullan, kaydet ama uyar
                    print(f"[UYARI] Bilinmeyen ayır: {urun_cinsi}, milyem=0 kullanıldı")
                    milyem = 0.0
            hesaplanan_has = round(brut * milyem, 4)

        # 3. Veritabanına Yazma
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO islemler
            (personel_id, islem_tipi, urun_kategorisi, islem_birimi, urun_cinsi,
             brut_miktar, milyem, birim_fiyat, net_has_miktar, odeme_tipi, adet,
             doviz_tutar, doviz_kuru)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                payload.personel_id, islem_tipi, urun_kategorisi, islem_birimi,
                urun_cinsi, brut, milyem, payload.birim_fiyat, hesaplanan_has,
                odeme_tipi, adet, payload.doviz_tutar, payload.doviz_kuru
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
            "doviz_tutar": payload.doviz_tutar,
            "doviz_kuru":  payload.doviz_kuru,
            "birim_fiyat": payload.birim_fiyat,
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
async def personel_ekle(payload: PersonelPayload):
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
        
        # Burayı korumaya alıyoruz ki ses tetikleme hatası tüm API'yi 500'e düşürmesin
        try:
            personel_tetikleme_haritasi_yenile()
        except Exception as nlp_err:
            print(f"[UYARI] Personel eklendi fakat ses haritası yenilenemedi: {nlp_err}")

        await manager.broadcast_text(json.dumps({"type": "REFRESH_PERSONELLER"}))
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
async def personel_guncelle(personel_id: int, payload: PersonelPayload):
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
        await manager.broadcast_text(json.dumps({"type": "REFRESH_PERSONELLER"}))
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
async def islem_sil_ve_geri_al(islem_id: int):
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
        has_val = float(net_has) if net_has is not None else 0.0
        payload = json.dumps({
            "type": "UNDO_TX",
            "id": islem_id,
            "tip": islem_tipi,
            "has": has_val
        })
        await manager.broadcast_text(payload)
        
        return {"mesaj": "İşlem başarıyla geri alındı."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Geri alma başarısız: {e}")
    finally:
        if conn: conn.close()

@app.delete("/personeller/{personel_id}")
async def personel_sil(personel_id: int, mod: str = Query("normal")):
    """
    Personeli siler.
    mod=normal   → İşlem geçmişi varsa 400 döner (default).
    mod=cascade  → Personele ait tüm islemler silinir, sonra personel silinir.
    mod=detach   → Personele ait islemler anonim kalır (personel_id=NULL), personel silinir.
    """
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()

        # Önce personelin var olduğunu doğrula
        cursor.execute("SELECT id, ad_soyad FROM personeller WHERE id = %s", (personel_id,))
        personel_row = cursor.fetchone()
        if not personel_row:
            raise HTTPException(status_code=404, detail="Personel bulunamadı.")

        if mod == "cascade":
            # Personele ait tüm işlemleri sil, sonra personeli sil
            cursor.execute("DELETE FROM islemler WHERE personel_id = %s", (personel_id,))
            cursor.execute("DELETE FROM personeller WHERE id = %s", (personel_id,))

        elif mod == "detach":
            # islemler.personel_id NULL'a izin verecek şekilde ALTER (sadece bir kez çalışır)
            cursor.execute("""
                ALTER TABLE islemler
                ALTER COLUMN personel_id DROP NOT NULL
            """)
            # Personele ait işlemlerin personel_id'sini NULL yap
            cursor.execute(
                "UPDATE islemler SET personel_id = NULL WHERE personel_id = %s",
                (personel_id,)
            )
            cursor.execute("DELETE FROM personeller WHERE id = %s", (personel_id,))

        else:
            # normal mod — ForeignKeyViolation'ı catch et
            cursor.execute("DELETE FROM personeller WHERE id = %s RETURNING id", (personel_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="Personel bulunamadı.")

        conn.commit()

        try:
            personel_tetikleme_haritasi_yenile()
        except Exception as e:
            print(f"Uyarı: Personel silindi ancak ses haritası güncellenemedi: {e}")

        await manager.broadcast_text(json.dumps({"type": "REFRESH_PERSONELLER"}))
        return {"mesaj": "Personel başarıyla silindi.", "id": personel_id}

    except psycopg2.errors.ForeignKeyViolation:
        if conn: conn.rollback()
        raise HTTPException(
            status_code=400,
            detail="Bu personele ait geçmiş işlemler bulunuyor. Silmek için 'İşlemleri de Sil' veya 'İşlemleri Bırak' seçeneğini kullanın."
        )
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Beklenmeyen sistem hatası: {str(e)}")
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
                "doviz_tutar":     float(r[13]) if r[13] is not None else 0.0,
                "doviz_kuru":      float(r[14]) if r[14] is not None else 1.0,
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


class KurlarPayload(BaseModel):
    usd_try: float
    eur_try: float
    gram_altin_24k_try: float


@app.put("/piyasa/kurlar")
async def kurlari_guncelle(payload: KurlarPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM gunluk_kurlar")
        count = cursor.fetchone()[0]
        if count == 0:
            cursor.execute(
                "INSERT INTO gunluk_kurlar (usd_try, eur_try, gram_altin_24k_try) VALUES (%s, %s, %s)",
                (payload.usd_try, payload.eur_try, payload.gram_altin_24k_try)
            )
        else:
            cursor.execute(
                "UPDATE gunluk_kurlar SET usd_try = %s, eur_try = %s, gram_altin_24k_try = %s, guncellenme_tarihi = NOW()",
                (payload.usd_try, payload.eur_try, payload.gram_altin_24k_try)
            )
        conn.commit()
        
        # Güncellenen kurları global cache değişkenlerine de yansıtalım
        global _market_cache_data, _market_cache_ts
        _market_cache_data = {
            "usd_try": payload.usd_try,
            "eur_try": payload.eur_try,
            "gram_altin_24k_try": payload.gram_altin_24k_try,
            "guncellenme_ts": int(time.time()),
            "kaynak": "Kullanıcı Tanımlı (Yerel)",
        }
        _market_cache_ts = time.time()
        
        # Soket üzerinden tüm bağlı istemcilere kur değişimini haber ver
        await manager.broadcast_text(json.dumps({"type": "REFRESH_KURLAR"}))
        
        return {"mesaj": "Kurlar başarıyla güncellendi."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


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

# ─────────────────────────────────────────────
# TOPTANCI (CARI) MODÜLÜ
# ─────────────────────────────────────────────

class ToptanciPayload(BaseModel):
    unvan: str
    telefon: str | None = None
    aciklama: str | None = None

class ToptanciIslemPayload(BaseModel):
    islem_tipi: str # "Borçlanma", "Ödeme" vb.
    islem_detayi: str # "Nakit Ödeme", "Hurda Teslimi", "Mal Alış" vb.
    has_altin: float = 0.0
    tl_tutar: float = 0.0
    aciklama: str | None = None

class CokluIslemKalemPayload(BaseModel):
    islem_tipi: str
    islem_detayi: str
    has_altin: float = 0.0
    tl_tutar: float = 0.0

class ToptanciCokluIslemPayload(BaseModel):
    aciklama: str | None = None
    kalemler: list[CokluIslemKalemPayload]

@app.get("/toptancilar")
def toptanci_listesi():
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                t.id, t.unvan, t.telefon, t.aciklama, t.olusturulma_tarihi,
                COALESCE(SUM(ti.has_altin), 0) AS bakiye_has,
                COALESCE(SUM(ti.tl_tutar), 0) AS bakiye_tl
            FROM toptancilar t
            LEFT JOIN toptanci_islemler ti ON t.id = ti.toptanci_id
            GROUP BY t.id
            ORDER BY t.unvan ASC
        """)
        rows = cursor.fetchall()
        
        toptancilar = []
        for r in rows:
            toptancilar.append({
                "id": r[0], "unvan": r[1], "telefon": r[2], "aciklama": r[3],
                "olusturulma_tarihi": r[4], "bakiye_has": float(r[5]), "bakiye_tl": float(r[6])
            })
        return toptancilar
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.post("/toptancilar")
def toptanci_ekle(payload: ToptanciPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO toptancilar (unvan, telefon, aciklama) VALUES (%s, %s, %s) RETURNING id",
            (payload.unvan, payload.telefon, payload.aciklama)
        )
        new_id = cursor.fetchone()[0]
        conn.commit()
        return {"mesaj": "Toptancı eklendi", "id": new_id}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.delete("/toptancilar/{toptanci_id}")
def toptanci_sil(toptanci_id: int):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM toptancilar WHERE id = %s", (toptanci_id,))
        conn.commit()
        return {"mesaj": "Toptancı silindi"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.get("/toptancilar/{toptanci_id}/islemler")
def toptanci_islemleri_getir(toptanci_id: int):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        # Önce toptancı bilgilerini çek
        cursor.execute("""
            SELECT id, unvan, telefon, aciklama,
                   (SELECT COALESCE(SUM(has_altin),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_has,
                   (SELECT COALESCE(SUM(tl_tutar),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_tl
            FROM toptancilar WHERE id = %s
        """, (toptanci_id, toptanci_id, toptanci_id))
        t_row = cursor.fetchone()
        if not t_row:
            raise HTTPException(status_code=404, detail="Toptancı bulunamadı")
            
        toptanci = {
            "id": t_row[0], "unvan": t_row[1], "telefon": t_row[2], "aciklama": t_row[3],
            "bakiye_has": float(t_row[4]), "bakiye_tl": float(t_row[5])
        }

        # Sonra işlemlerini çek
        cursor.execute("""
            SELECT id, islem_tipi, islem_detayi, has_altin, tl_tutar, aciklama, islem_tarihi
            FROM toptanci_islemler
            WHERE toptanci_id = %s
            ORDER BY islem_tarihi DESC
        """, (toptanci_id,))
        
        islemler = []
        for r in cursor.fetchall():
            islemler.append({
                "id": r[0], "islem_tipi": r[1], "islem_detayi": r[2],
                "has_altin": float(r[3]), "tl_tutar": float(r[4]),
                "aciklama": r[5], "islem_tarihi": r[6]
            })
            
        return {"toptanci": toptanci, "islemler": islemler}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.post("/toptancilar/{toptanci_id}/islemler")
def toptanci_islem_ekle(toptanci_id: int, payload: ToptanciIslemPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Eğer Borçlanma (Mal Alış) ise borç (+) yazılır (Kuyumcunun borcu artar)
        # Ödeme ise borç (-) yazılır (Kuyumcunun borcu azalır)
        # Frontend direk + veya - gönderecek şekilde tasarlanabilir ama biz burada
        # backend tarafında güvenliği sağlamak için işaretleri belirleyebiliriz.
        # Basitlik için frontend'den her zaman mutlak değer (pozitif) geldiğini varsayalım.
        
        has_val = abs(payload.has_altin)
        tl_val = abs(payload.tl_tutar)
        
        if payload.islem_tipi == "Ödeme":
            has_val = -has_val
            tl_val = -tl_val
            
        cursor.execute("""
            INSERT INTO toptanci_islemler (toptanci_id, islem_tipi, islem_detayi, has_altin, tl_tutar, aciklama)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (toptanci_id, payload.islem_tipi, payload.islem_detayi, has_val, tl_val, payload.aciklama))
        
        new_id = cursor.fetchone()[0]
        conn.commit()
        return {"mesaj": "İşlem kaydedildi", "id": new_id}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.post("/toptancilar/{toptanci_id}/coklu_islemler")
def toptanci_coklu_islem_ekle(toptanci_id: int, payload: ToptanciCokluIslemPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        for kalem in payload.kalemler:
            has_val = abs(kalem.has_altin)
            tl_val = abs(kalem.tl_tutar)
            if kalem.islem_tipi == "Ödeme":
                has_val = -has_val
                tl_val = -tl_val
                
            cursor.execute("""
                INSERT INTO toptanci_islemler (toptanci_id, islem_tipi, islem_detayi, has_altin, tl_tutar, aciklama)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (toptanci_id, kalem.islem_tipi, kalem.islem_detayi, has_val, tl_val, payload.aciklama))
            
        conn.commit()
        return {"mesaj": f"{len(payload.kalemler)} adet işlem kaydedildi."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.delete("/toptanci_islemler/{islem_id}")
def toptanci_islem_sil(islem_id: int):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM toptanci_islemler WHERE id = %s", (islem_id,))
        conn.commit()
        return {"mesaj": "İşlem silindi"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()