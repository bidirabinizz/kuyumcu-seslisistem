import asyncio
import json
import os
import hashlib
import threading
import traceback
from contextlib import asynccontextmanager
from fpdf import FPDF
from fastapi.responses import FileResponse
import psycopg2
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import socket
import time
from datetime import datetime
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

_kurlar_stop_event = threading.Event()

def _fetch_rates_from_cloudflare_worker():
    url = "https://altin-tunnel.siper2710.workers.dev/"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data_raw = resp.read()
    result = json.loads(data_raw.decode('utf-8'))
    items = result.get("data", [])
    
    usd = None
    eur = None
    gold = None
    
    for item in items:
        sym = item.get("symbol", "").upper().strip()
        bid = float(item.get("bid") or 0)
        ask = float(item.get("ask") or 0)
        val = ask if ask > 0 else bid
        
        if sym in ["USDTRY", "DS_USDTRY"]:
            usd = val
        elif sym in ["EURTRY", "DS_EURTRY"]:
            eur = val
        elif sym in ["ALTIN", "DS_ALTIN"]:
            gold = val
            
    if not usd or not eur or not gold:
        for item in items:
            sym = item.get("symbol", "").upper().strip()
            bid = float(item.get("bid") or 0)
            ask = float(item.get("ask") or 0)
            val = ask if ask > 0 else bid
            if "USDTRY" in sym and not usd:
                usd = val
            elif "EURTRY" in sym and not eur:
                eur = val
            elif "ALTIN" in sym and not gold:
                gold = val
                
    return usd, eur, gold

def _auto_update_kurlar_listener():
    print("[KURLAR] Otomatik kur güncelleme servisi başlatıldı.")
    time.sleep(5) # Veritabanı ve tablolar hazır olana kadar bekle
    while not _kurlar_stop_event.is_set():
        try:
            usd, eur, gold = _fetch_rates_from_cloudflare_worker()
            if usd and eur and gold:
                # DB'yi güncelle
                conn = psycopg2.connect(**DB_CONFIG)
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM gunluk_kurlar")
                count = cursor.fetchone()[0]
                if count == 0:
                    cursor.execute(
                        "INSERT INTO gunluk_kurlar (usd_try, eur_try, gram_altin_24k_try) VALUES (%s, %s, %s)",
                        (usd, eur, gold)
                    )
                else:
                    cursor.execute(
                        "UPDATE gunluk_kurlar SET usd_try = %s, eur_try = %s, gram_altin_24k_try = %s, guncellenme_tarihi = NOW()",
                        (usd, eur, gold)
                    )
                conn.commit()
                cursor.close()
                conn.close()
                
                # Cache ve trendleri güncelle
                global _market_cache_data, _market_cache_prev_data, _market_cache_ts
                with _market_cache_lock:
                    if _market_cache_data is None:
                        _market_cache_prev_data = {
                            "usd_try": usd,
                            "eur_try": eur,
                            "gram_altin_24k_try": gold
                        }
                    elif (
                        _market_cache_data.get("usd_try") != usd or
                        _market_cache_data.get("eur_try") != eur or
                        _market_cache_data.get("gram_altin_24k_try") != gold
                    ):
                        _market_cache_prev_data = _market_cache_data
                    
                    _market_cache_data = {
                        "usd_try": usd,
                        "eur_try": eur,
                        "gram_altin_24k_try": gold,
                        "guncellenme_ts": int(time.time()),
                        "kaynak": "Cloudflare Worker (Otomatik)",
                    }
                    _market_cache_ts = time.time()
                
                print(f"[KURLAR] Kurlar otomatik güncellendi - USD: {usd}, EUR: {eur}, Altın: {gold}")
        except Exception as e:
            print(f"[KURLAR] Kurlar güncellenirken hata: {e}")
            
        # 10 saniyede bir kontrol et
        for _ in range(10):
            if _kurlar_stop_event.is_set():
                break
            time.sleep(1)

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

    # Otomatik Kur Güncelleme servisi — daemon thread olarak başlat
    _kurlar_stop_event.clear()
    kurlar_thread = threading.Thread(target=_auto_update_kurlar_listener, daemon=True)
    kurlar_thread.start()

    yield

    # Temizlik
    _udp_stop_event.set()
    _kurlar_stop_event.set()


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

class UrunStokModel(BaseModel):
    urun_id: int
    kod: str
    ozellikler: Optional[str] = ""
    maliyet_usd: Optional[float] = 0.0
    satis_fiyati: float
    para_birimi: str = "USD"

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
    urun_stok_id: int | None = None # Pırlanta/Saat satışı ise seçilen stok kodu id'si


class UrunStokPayload(BaseModel):
    urun_id: int
    kod: str
    ozellikler: str | None = None
    maliyet_usd: float = 0.0
    satis_fiyati: float
    para_birimi: str = "USD"
    satildi_mi: bool = False

class UrunStokGuncellePayload(BaseModel):
    kod: str | None = None
    ozellikler: str | None = None
    maliyet_usd: float | None = None
    satis_fiyati: float | None = None
    para_birimi: str | None = None
    satildi_mi: bool | None = None

class UrunPayload(BaseModel):
    ad: str
    urun_cinsi: str
    urun_kategorisi: str   # "ALTIN" | "SARRAFIYE" | "PIRLANTA"
    islem_birimi: str = "GRAM"
    milyem: float = 0.0
    alis_milyem: float = 0.0
    satis_milyem: float = 0.0
    has_karsiligi: float = 0.0
    renk: str = "amber"    # UI renk ipucu: amber | yellow | orange | red | purple | blue
    sira: int = 0
    aktif: bool = True
    urun_grubu: str | None = "Diğer"
    mobil_aktif: bool = True
    favori: bool = False
    stok_takibi: bool = False

class UrunGuncellePayload(BaseModel):
    ad: str | None = None
    urun_cinsi: str | None = None
    urun_kategorisi: str | None = None
    islem_birimi: str | None = None
    milyem: float | None = None
    alis_milyem: float | None = None
    satis_milyem: float | None = None
    has_karsiligi: float | None = None
    renk: str | None = None
    sira: int | None = None
    aktif: bool | None = None
    urun_grubu: str | None = None
    mobil_aktif: bool | None = None
    favori: bool | None = None
    stok_takibi: bool | None = None

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
        cursor.execute("""
            ALTER TABLE urunler ADD COLUMN IF NOT EXISTS favori BOOLEAN DEFAULT FALSE;
        """)
        cursor.execute("""
            ALTER TABLE urunler ADD COLUMN IF NOT EXISTS stok_takibi BOOLEAN DEFAULT FALSE;
        """)
        cursor.execute("""
            ALTER TABLE urunler ADD COLUMN IF NOT EXISTS alis_milyem NUMERIC(8,4) DEFAULT 0;
        """)
        cursor.execute("""
            ALTER TABLE urunler ADD COLUMN IF NOT EXISTS satis_milyem NUMERIC(8,4) DEFAULT 0;
        """)
        cursor.execute("""
            UPDATE urunler SET stok_takibi = TRUE WHERE urun_kategorisi = 'PIRLANTA';
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
        
        # --- Toptancı İşlemleri için Döviz ---
        cursor.execute("""
            ALTER TABLE toptanci_islemler ADD COLUMN IF NOT EXISTS usd_tutar NUMERIC(15,2) DEFAULT 0;
        """)
        cursor.execute("""
            ALTER TABLE toptanci_islemler ADD COLUMN IF NOT EXISTS eur_tutar NUMERIC(15,2) DEFAULT 0;
        """)

        # --- Müşteriler ve Müşteri İşlemleri (Emanet) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS musteri_emanetler (
                id SERIAL PRIMARY KEY,
                musteri_adi VARCHAR(200) NOT NULL,
                telefon VARCHAR(50),
                not_detayi TEXT,
                teslim_edildi_mi BOOLEAN DEFAULT FALSE,
                teslim_tarihi TIMESTAMP,
                olusturulma_tarihi TIMESTAMP DEFAULT NOW()
            )
        """)
        
        cursor.execute("""
            ALTER TABLE musteri_emanetler ADD COLUMN IF NOT EXISTS kategori VARCHAR(50) DEFAULT 'Genel';
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
                ('DÖVİZ',    '💵 Döviz',    'emerald', 4),
            ]
            cursor.executemany(
                "INSERT INTO kategoriler (ad, etiket, renk, sira) VALUES (%s, %s, %s, %s)",
                varsayilan_kategoriler
            )
            print(f"[DB] {len(varsayilan_kategoriler)} varsayılan kategori eklendi.")
        
        # Her durumda DÖVİZ kategorisinin var olduğundan emin ol
        cursor.execute("INSERT INTO kategoriler (ad, etiket, renk, sira) VALUES ('DÖVİZ', '💵 Döviz', 'emerald', 4) ON CONFLICT (ad) DO NOTHING;")
            
        # urunler tablosunda urun_kategorisi kolonu VARCHAR(100) genişlet
        cursor.execute("""
            ALTER TABLE urunler 
            ALTER COLUMN urun_kategorisi TYPE VARCHAR(100);
        """)
        cursor.execute("""
            ALTER TABLE urunler ADD COLUMN IF NOT EXISTS mobil_aktif BOOLEAN DEFAULT TRUE;
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
                islem_detayi       VARCHAR(250),         -- Örn: 'Nakit Ödeme', 'Hurda Teslimi', 'Has Altın Teslimi', 'Mal Alış'
                has_altin          NUMERIC(15,4) DEFAULT 0, -- Pozitif veya Negatif değer
                tl_tutar           NUMERIC(15,2) DEFAULT 0, -- Pozitif veya Negatif değer
                aciklama           TEXT,
                islem_tarihi       TIMESTAMP DEFAULT NOW()
            )
        """)

        # 7.5. Ürün Stok Tablosu (Örn: Pırlanta, Saat vb. barkodlu ürünler için)
        cursor.execute("""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pirlanta_stok') THEN
                    ALTER TABLE pirlanta_stok RENAME TO urun_stok;
                END IF;
                CREATE TABLE IF NOT EXISTS urun_stok (
                    id             SERIAL PRIMARY KEY,
                    urun_id        INTEGER REFERENCES urunler(id) ON DELETE CASCADE,
                    kod            VARCHAR(100) UNIQUE NOT NULL,
                    ozellikler     TEXT,
                    maliyet_usd    NUMERIC(15,2) DEFAULT 0,
                    satis_fiyati   NUMERIC(15,2) NOT NULL,
                    satildi_mi     BOOLEAN DEFAULT FALSE,
                    satildi_islem_id INTEGER REFERENCES islemler(id) ON DELETE SET NULL,
                    eklenme_tarihi TIMESTAMP DEFAULT NOW()
                );
                IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'urun_stok' AND column_name = 'urun_id') THEN
                    ALTER TABLE urun_stok ADD COLUMN urun_id INTEGER REFERENCES urunler(id) ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'urun_stok' AND column_name = 'para_birimi') THEN
                    ALTER TABLE urun_stok ADD COLUMN para_birimi VARCHAR(10) DEFAULT 'USD';
                END IF;
            END $$;
        """)

        # 7.6. Yonetici Tablosu & Seed
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS yonetici (
                id         SERIAL PRIMARY KEY,
                email      VARCHAR(150) UNIQUE NOT NULL,
                sifre_hash VARCHAR(255) NOT NULL
            )
        """)
        cursor.execute("SELECT COUNT(*) FROM yonetici")
        y_count = cursor.fetchone()[0]
        if y_count == 0:
            default_email = "admin@caparkuyumculuk.com"
            default_pass_hash = hashlib.sha256("admin".encode("utf-8")).hexdigest()
            cursor.execute(
                "INSERT INTO yonetici (email, sifre_hash) VALUES (%s, %s)",
                (default_email, default_pass_hash)
            )
            print("[DB] Varsayılan yönetici hesabı eklendi (admin@caparkuyumculuk.com / admin).")

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
        
        # Her durumda Döviz ürünlerinin (USD, EUR) var olduğundan emin ol
        cursor.execute("SELECT COUNT(*) FROM urunler WHERE urun_cinsi IN ('USD', 'EUR')")
        doviz_products_count = cursor.fetchone()[0]
        if doviz_products_count == 0:
            doviz_urunler = [
                ("Amerikan Doları (USD)", "USD", "DÖVİZ", "ADET", 0.0, 0.0, "emerald", 10),
                ("Euro (EUR)",            "EUR", "DÖVİZ", "ADET", 0.0, 0.0, "emerald", 11),
            ]
            cursor.executemany(
                """INSERT INTO urunler
                   (ad, urun_cinsi, urun_kategorisi, islem_birimi, milyem, has_karsiligi, renk, sira)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                doviz_urunler
            )
            print("[DB] Döviz ürünleri (USD, EUR) eklendi.")
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
            COALESCE(i.doviz_kuru, 1)             AS doviz_kuru,
            (SELECT ad FROM urunler WHERE urun_cinsi = i.urun_cinsi LIMIT 1) AS urun_adi,
            (SELECT kod FROM urun_stok WHERE satildi_islem_id = i.id LIMIT 1) AS stok_kodu
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
        select_cols = (
            "id, ad, urun_cinsi, urun_kategorisi, islem_birimi, "
            "milyem, has_karsiligi, renk, sira, aktif, COALESCE(urun_grubu, 'Diğer'), "
            "COALESCE(mobil_aktif, TRUE), COALESCE(favori, FALSE), COALESCE(stok_takibi, FALSE), "
            "COALESCE(alis_milyem, 0), COALESCE(satis_milyem, 0)"
        )
        if hepsi:
            cursor.execute(f"SELECT {select_cols} FROM urunler ORDER BY sira ASC, id ASC")
        else:
            cursor.execute(f"SELECT {select_cols} FROM urunler WHERE aktif = TRUE ORDER BY sira ASC, id ASC")
        rows = cursor.fetchall()
        return [
            {
                "id": r[0], "ad": r[1], "urun_cinsi": r[2],
                "urun_kategorisi": r[3], "islem_birimi": r[4],
                "milyem": float(r[5]), "has_karsiligi": float(r[6]),
                "renk": r[7], "sira": r[8], "aktif": r[9],
                "urun_grubu": r[10], "mobil_aktif": bool(r[11]),
                "favori": bool(r[12]), "stok_takibi": bool(r[13]),
                "alis_milyem": float(r[14]), "satis_milyem": float(r[15])
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
               (ad, urun_cinsi, urun_kategorisi, islem_birimi, milyem, alis_milyem, satis_milyem, has_karsiligi, renk, sira, aktif, urun_grubu, mobil_aktif, favori, stok_takibi)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (
                payload.ad.strip(), payload.urun_cinsi.strip().upper(),
                payload.urun_kategorisi.strip().upper(), payload.islem_birimi.strip().upper(),
                payload.milyem, payload.alis_milyem, payload.satis_milyem, payload.has_karsiligi,
                payload.renk, payload.sira, payload.aktif,
                (payload.urun_grubu or "Diğer").strip(), payload.mobil_aktif, payload.favori, payload.stok_takibi
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
            "alis_milyem": payload.alis_milyem, "satis_milyem": payload.satis_milyem,
            "has_karsiligi": payload.has_karsiligi, "renk": payload.renk,
            "sira": payload.sira, "aktif": payload.aktif,
            "urun_grubu": payload.urun_grubu, "mobil_aktif": payload.mobil_aktif,
            "favori": payload.favori, "stok_takibi": payload.stok_takibi
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
class KategoriSiralaPayload(BaseModel):
    sirali_id_listesi: list[int]

def _normalize_kategori_sirasi(cursor):
    """Kategorilerin sıra numaralarını 1'den başlayarak ardışık ve benzersiz şekilde günceller."""
    cursor.execute("SELECT id FROM kategoriler ORDER BY sira ASC, id ASC")
    rows = cursor.fetchall()
    for index, r in enumerate(rows):
        cursor.execute("UPDATE kategoriler SET sira = %s WHERE id = %s", (index + 1, r[0]))

@app.post("/kategoriler/sirala")
async def kategorileri_sirala(payload: KategoriSiralaPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        # Listeyi sırayla güncelle
        for index, kat_id in enumerate(payload.sirali_id_listesi):
            cursor.execute(
                "UPDATE kategoriler SET sira = %s WHERE id = %s",
                (index + 1, kat_id)
            )
        conn.commit()
        cursor.close()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_KATEGORILER"}))
        return {"mesaj": "Kategoriler başarıyla sıralandı."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Sıralama güncellenemedi: {e}")
    finally:
        if conn: conn.close()

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
        # Sıra belirtilmediyse otomatik olarak sıranın sonuna ekle
        cursor.execute("SELECT COALESCE(MAX(sira), 0) FROM kategoriler")
        max_sira = cursor.fetchone()[0]
        sira_val = payload.sira if payload.sira > 0 else (max_sira + 1)

        cursor.execute(
            "INSERT INTO kategoriler (ad, etiket, renk, sira, aktif) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (payload.ad.strip().upper(), payload.etiket.strip(), payload.renk.strip(), sira_val, payload.aktif)
        )
        new_id = cursor.fetchone()[0]
        _normalize_kategori_sirasi(cursor)
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
        _normalize_kategori_sirasi(cursor)
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
        _normalize_kategori_sirasi(cursor)
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

        elif urun_kategorisi in ("DÖVİZ", "DOVIZ"):
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
        
        # Ürün Stok Güncellemesi (Eğer satılan bir pırlanta/saat ise ve stok id gelmişse)
        if getattr(payload, 'urun_stok_id', None) is not None and islem_tipi == "SATIS":
            cursor.execute(
                "UPDATE urun_stok SET satildi_mi = TRUE, satildi_islem_id = %s WHERE id = %s",
                (row_id, payload.urun_stok_id)
            )
            
        conn.commit()
        cursor.close()

        if getattr(payload, 'urun_stok_id', None) is not None and islem_tipi == "SATIS":
            await manager.broadcast_text(json.dumps({"type": "REFRESH_URUN_STOK"}))

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
        elif urun_kategorisi in ("DÖVİZ", "DOVIZ"):
            milyem = 0.0
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
                milyem=%s, birim_fiyat=%s, net_has_miktar=%s, odeme_tipi=%s, adet=%s,
                doviz_tutar=%s, doviz_kuru=%s
            WHERE id=%s
            """,
            (islem_tipi, urun_kategorisi, urun_cinsi, brut,
             milyem, payload.birim_fiyat, hesaplanan_has, odeme_tipi, adet,
             payload.doviz_tutar, payload.doviz_kuru, islem_id)
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
            "doviz_tutar": payload.doviz_tutar,
            "doviz_kuru":  payload.doviz_kuru,
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
def personel_istatistikleri(
    start_date: str | None = None,
    end_date: str | None = None
):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        personeller_tablosunu_dogrula(conn)
        cursor = conn.cursor()
        
        # LEFT JOIN ile bağlarken tarih filtresini ON şartına koymalıyız
        # Aksi takdirde hiç işlemi olmayan personeller listeden kaybolur (INNER JOIN durumuna düşer)
        date_filter = ""
        params = []
        if start_date and end_date:
            date_filter = "AND i.islem_tarihi::date BETWEEN %s AND %s"
            params.extend([start_date, end_date])
        elif start_date:
            date_filter = "AND i.islem_tarihi::date = %s"
            params.append(start_date)

        query = f"""
            SELECT p.id, p.ad_soyad, p.tetikleme_kelimesi, p.rol,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='ALIS' THEN i.net_has_miktar ELSE 0 END),0) AS toplam_alis_has,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='SATIS' THEN i.net_has_miktar ELSE 0 END),0) AS toplam_satis_has,
                   COALESCE(SUM(COALESCE(i.birim_fiyat,0)),0) AS toplam_tl_hacim,
                   COUNT(i.id) AS islem_sayisi,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='ALIS' AND i.urun_kategorisi='ALTIN' THEN i.brut_miktar ELSE 0 END),0) AS toplam_alis_altin_gr,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='SATIS' AND i.urun_kategorisi='ALTIN' THEN i.brut_miktar ELSE 0 END),0) AS toplam_satis_altin_gr,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='ALIS' AND i.urun_kategorisi='SARRAFIYE' THEN i.brut_miktar ELSE 0 END),0) AS toplam_alis_sarrafiye_adet,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='SATIS' AND i.urun_kategorisi='SARRAFIYE' THEN i.brut_miktar ELSE 0 END),0) AS toplam_satis_sarrafiye_adet,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='ALIS' THEN COALESCE(i.birim_fiyat,0) ELSE 0 END),0) AS toplam_alis_tl,
                   COALESCE(SUM(CASE WHEN i.islem_tipi='SATIS' THEN COALESCE(i.birim_fiyat,0) ELSE 0 END),0) AS toplam_satis_tl
            FROM personeller p
            LEFT JOIN islemler i ON i.personel_id = p.id {date_filter}
            GROUP BY p.id, p.ad_soyad, p.tetikleme_kelimesi, p.rol
            ORDER BY p.id ASC
        """
        cursor.execute(query, tuple(params))
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
                "toplam_alis_altin_gr": float(r[8] or 0),
                "toplam_satis_altin_gr": float(r[9] or 0),
                "toplam_alis_sarrafiye_adet": int(r[10] or 0),
                "toplam_satis_sarrafiye_adet": int(r[11] or 0),
                "toplam_alis_tl": float(r[12] or 0),
                "toplam_satis_tl": float(r[13] or 0),
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
            os.path.join(os.path.dirname(__file__), "DejaVuSans.ttf"),
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
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
        widths  = [26, 24, 12, 40, 20, 18, 30, 20] 
        
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
            kategori = row[9]
            urun_adi = row[15] if len(row) > 15 else None
            stok_kodu = row[16] if len(row) > 16 else None
            
            if stok_kodu:
                kat_upper = (kategori or "").strip().upper()
                kat_map = {
                    "PIRLANTA": "Pırlanta",
                    "SAAT": "Saat",
                    "SET": "Set",
                    "ALTIN": "Altın",
                    "SARRAFIYE": "Sarrafiye",
                    "DÖVİZ": "Döviz",
                    "DOVIZ": "Döviz"
                }
                kat_title = kat_map.get(kat_upper, kat_upper.capitalize())
                urun = f"{kat_title} - {stok_kodu}"
            else:
                if urun_adi:
                    urun = str(urun_adi)
                else:
                    cinsi = (row[3] or "").strip().upper()
                    cinsi_map = {
                        "24_AYAR": "24 Ayar",
                        "22_AYAR": "22 Ayar",
                        "18_AYAR": "18 Ayar",
                        "14_AYAR": "14 Ayar",
                        "CEYREK_ALTIN": "Çeyrek Altın",
                        "YARIM_ALTIN": "Yarım Altın",
                        "TAM_ALTIN": "Tam Altın",
                        "ATA_ALTIN": "Ata Altın",
                        "PIRLANTA": "Pırlanta",
                        "USD": "Dolar (USD)",
                        "EUR": "Euro (EUR)",
                        "TRY": "Türk Lirası (TRY)"
                    }
                    if cinsi in cinsi_map:
                        urun = cinsi_map[cinsi]
                    else:
                        words = cinsi.split("_")
                        cleaned_words = []
                        for w in words:
                            if w == "AYAR":
                                cleaned_words.append("Ayar")
                            elif w == "BILEZIK":
                                cleaned_words.append("Bilezik")
                            elif w == "KOLYE":
                                cleaned_words.append("Kolye")
                            elif w == "ALTIN":
                                cleaned_words.append("Altın")
                            else:
                                cleaned_words.append(w.capitalize())
                        urun = " ".join(cleaned_words)
                
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
    islem_tipi: str
    islem_detayi: str
    has_altin: float = 0.0
    tl_tutar: float = 0.0
    usd_tutar: float = 0.0
    eur_tutar: float = 0.0
    aciklama: str | None = None


class CokluIslemKalemPayload(BaseModel):
    islem_tipi: str
    islem_detayi: str
    has_altin: float = 0.0
    tl_tutar: float = 0.0
    usd_tutar: float = 0.0
    eur_tutar: float = 0.0

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
                COALESCE(SUM(ti.tl_tutar), 0) AS bakiye_tl,
                COALESCE(SUM(ti.usd_tutar), 0) AS bakiye_usd,
                COALESCE(SUM(ti.eur_tutar), 0) AS bakiye_eur
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
                "olusturulma_tarihi": r[4], "bakiye_has": float(r[5]), "bakiye_tl": float(r[6]), "bakiye_usd": float(r[7]), "bakiye_eur": float(r[8])
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
                 (SELECT COALESCE(SUM(tl_tutar),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_tl,
                 (SELECT COALESCE(SUM(usd_tutar),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_usd,
                 (SELECT COALESCE(SUM(eur_tutar),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_eur
            FROM toptancilar WHERE id = %s
        """, (toptanci_id, toptanci_id, toptanci_id, toptanci_id, toptanci_id))
        t_row = cursor.fetchone()
        if not t_row:
            raise HTTPException(status_code=404, detail="Toptancı bulunamadı")
            
        toptanci = {
            "id": t_row[0], "unvan": t_row[1], "telefon": t_row[2], "aciklama": t_row[3],
            "bakiye_has": float(t_row[4]), "bakiye_tl": float(t_row[5]), "bakiye_usd": float(t_row[6]), "bakiye_eur": float(t_row[7])
        }

        # Sonra işlemlerini çek
        cursor.execute("""
            SELECT id, islem_tipi, islem_detayi, has_altin, tl_tutar, usd_tutar, eur_tutar, aciklama, islem_tarihi
            FROM toptanci_islemler
            WHERE toptanci_id = %s
            ORDER BY islem_tarihi DESC
        """, (toptanci_id,))
        
        islemler = []
        for r in cursor.fetchall():
            islemler.append({
                "id": r[0], "islem_tipi": r[1], "islem_detayi": r[2],
                "has_altin": float(r[3]),
                "tl_tutar": float(r[4]),
                "usd_tutar": float(r[5]) if r[5] else 0.0,
                "eur_tutar": float(r[6]) if r[6] else 0.0,
                "aciklama": r[7],
                "islem_tarihi": r[8]
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
        
        has_val = abs(payload.has_altin)
        tl_val = abs(payload.tl_tutar)
        usd_val = abs(payload.usd_tutar)
        eur_val = abs(payload.eur_tutar)
        
        if payload.islem_tipi == "Ödeme":
            has_val = -has_val
            tl_val = -tl_val
            usd_val = -usd_val
            eur_val = -eur_val
            
        cursor.execute("""
            INSERT INTO toptanci_islemler (toptanci_id, islem_tipi, islem_detayi, has_altin, tl_tutar, usd_tutar, eur_tutar, aciklama)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (toptanci_id, payload.islem_tipi, payload.islem_detayi, has_val, tl_val, usd_val, eur_val, payload.aciklama))
        
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
            usd_val = abs(getattr(kalem, 'usd_tutar', 0.0))
            eur_val = abs(getattr(kalem, 'eur_tutar', 0.0))
            if kalem.islem_tipi == "Ödeme":
                has_val = -has_val
                tl_val = -tl_val
                usd_val = -usd_val
                eur_val = -eur_val
                
            cursor.execute("""
                INSERT INTO toptanci_islemler (toptanci_id, islem_tipi, islem_detayi, has_altin, tl_tutar, usd_tutar, eur_tutar, aciklama)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (toptanci_id, kalem.islem_tipi, kalem.islem_detayi, has_val, tl_val, usd_val, eur_val, payload.aciklama))
            
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

@app.get("/toptancilar/{toptanci_id}/rapor/pdf")
def generate_toptanci_pdf_report(
    toptanci_id: int,
    gunler: int | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 1. Toptancı bilgilerini ve güncel bakiyesini çek
        cursor.execute("""
            SELECT id, unvan, telefon, aciklama,
                 (SELECT COALESCE(SUM(has_altin),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_has,
                 (SELECT COALESCE(SUM(tl_tutar),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_tl,
                 (SELECT COALESCE(SUM(usd_tutar),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_usd,
                 (SELECT COALESCE(SUM(eur_tutar),0) FROM toptanci_islemler WHERE toptanci_id = %s) as b_eur
            FROM toptancilar WHERE id = %s
        """, (toptanci_id, toptanci_id, toptanci_id, toptanci_id, toptanci_id))
        t_row = cursor.fetchone()
        if not t_row:
            raise HTTPException(status_code=404, detail="Toptancı bulunamadı")
            
        unvan = t_row[1]
        telefon = t_row[2] or "Belirtilmemiş"
        aciklama_genel = t_row[3] or "Açıklama yok"
        bakiye_has = float(t_row[4])
        bakiye_tl = float(t_row[5])
        bakiye_usd = float(t_row[6])
        bakiye_eur = float(t_row[7])
        
        # 2. İşlemleri filtreyle çek
        query = """
            SELECT id, islem_tipi, islem_detayi, has_altin, tl_tutar, usd_tutar, eur_tutar, aciklama, islem_tarihi
            FROM toptanci_islemler
            WHERE toptanci_id = %s
        """
        params = [toptanci_id]
        
        if start_date and end_date:
            if start_date == end_date:
                query += " AND islem_tarihi::date = %s"
                params.append(start_date)
            else:
                query += " AND islem_tarihi::date BETWEEN %s AND %s"
                params.extend([start_date, end_date])
        elif start_date:
            query += " AND islem_tarihi::date = %s"
            params.append(start_date)
        elif gunler is not None:
            query += " AND islem_tarihi >= NOW() - (%s * INTERVAL '1 day')"
            params.append(gunler)
            
        query += " ORDER BY islem_tarihi DESC"
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        
        # 3. Kapsam ve özet hesaplamalar
        if start_date and end_date and start_date != end_date:
            rapor_kapsami = f"{start_date} - {end_date}"
        elif start_date:
            rapor_kapsami = f"{start_date} (Tek Gün)"
        elif gunler:
            rapor_kapsami = f"Son {gunler} Gün"
        else:
            rapor_kapsami = "Tüm İşlemler"
            
        # Dönem toplamları
        period_has = sum(float(r[3] or 0) for r in rows)
        period_tl = sum(float(r[4] or 0) for r in rows)
        period_usd = sum(float(r[5] or 0) for r in rows)
        period_eur = sum(float(r[6] or 0) for r in rows)
        
        # PDF oluşturma
        pdf = CorporatePDF()
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()
        
        font_candidates = [
            os.path.join(os.path.dirname(__file__), "DejaVuSans.ttf"),
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
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
        pdf.cell(0, 5, f"TOPTANCI HESAP EKSTRESİ ({unvan.upper()})", ln=1, align="L")
        
        # Sağ üst kapsam ve tarih bilgisi
        current_y = pdf.get_y()
        pdf.set_xy(10, 10)
        pdf.set_font("Corporate", "", 9)
        pdf.cell(0, 8, f"Filtre Kapsamı: {rapor_kapsami}", ln=1, align="R")
        pdf.cell(0, 5, f"Çıktı Tarihi: {time.strftime('%d.%m.%Y %H:%M')}", ln=1, align="R")
        pdf.set_y(current_y + 8)
        
        # Toptancı Bilgileri Kartı (Telefon vb.)
        pdf.set_draw_color(226, 232, 240)
        pdf.set_fill_color(248, 250, 252)
        pdf.set_text_color(71, 85, 105)
        pdf.set_font("Corporate", "", 9)
        pdf.cell(0, 8, f"Telefon: {telefon}  |  Açıklama: {aciklama_genel}", border=1, fill=True, ln=1, align="L")
        pdf.ln(4)
        
        # --- ÖZET KARTLARI (KPI) ---
        # Metinleri hazırla
        has_period_str = f"{period_has:+.3f} gr Has".replace("+", "+ ") if period_has >= 0 else f"{period_has:.3f} gr Has"
        tl_period_str = f"{period_tl:+,.2f} TL".replace(",", ".").replace("+", "+ ") if period_tl >= 0 else f"{period_tl:,.2f} TL".replace(",", ".")
        period_metin = f"Dönem Has: {has_period_str}  |  Dönem TL: {tl_period_str}"
        if period_usd != 0:
            usd_period_str = f"{period_usd:+.2f} USD".replace("+", "+ ") if period_usd >= 0 else f"{period_usd:.2f} USD"
            period_metin += f"  |  Dönem USD: {usd_period_str}"
        if period_eur != 0:
            eur_period_str = f"{period_eur:+.2f} EUR".replace("+", "+ ") if period_eur >= 0 else f"{period_eur:.2f} EUR"
            period_metin += f"  |  Dönem EUR: {eur_period_str}"
            
        bakiye_has_str = f"{bakiye_has:+.3f} gr Has".replace("+", "+ ") if bakiye_has >= 0 else f"{bakiye_has:.3f} gr Has"
        bakiye_tl_str = f"{bakiye_tl:+,.2f} TL".replace(",", ".").replace("+", "+ ") if bakiye_tl >= 0 else f"{bakiye_tl:,.2f} TL".replace(",", ".")
        bakiye_metin = f"Güncel Has: {bakiye_has_str}  |  Güncel TL: {bakiye_tl_str}"
        if bakiye_usd != 0:
            bakiye_usd_str = f"{bakiye_usd:+.2f} USD".replace("+", "+ ") if bakiye_usd >= 0 else f"{bakiye_usd:.2f} USD"
            bakiye_metin += f"  |  Güncel USD: {bakiye_usd_str}"
        if bakiye_eur != 0:
            bakiye_eur_str = f"{bakiye_eur:+.2f} EUR".replace("+", "+ ") if bakiye_eur >= 0 else f"{bakiye_eur:.2f} EUR"
            bakiye_metin += f"  |  Güncel EUR: {bakiye_eur_str}"

        # Dinamik font boyutu ayarla (metin uzunsa küçült)
        if len(period_metin) > 85 or len(bakiye_metin) > 85:
            pdf.set_font("Corporate", "", 7)
        elif len(period_metin) > 60 or len(bakiye_metin) > 60:
            pdf.set_font("Corporate", "", 8)
        else:
            pdf.set_font("Corporate", "", 9)

        # Kart 1: Dönem Değişimi
        pdf.set_draw_color(191, 219, 254)
        pdf.set_fill_color(239, 246, 255)
        pdf.set_text_color(30, 64, 175)
        pdf.cell(92, 10, period_metin, border=1, fill=True, align="C")
        
        pdf.cell(6, 10, "", border=0) # İki kutu arası yatay boşluk
        
        # Kart 2: Güncel Genel Bakiye
        pdf.set_draw_color(212, 175, 55)
        pdf.set_fill_color(253, 250, 237)
        pdf.set_text_color(180, 130, 20)
        pdf.cell(92, 10, bakiye_metin, border=1, fill=True, ln=1, align="C")
        pdf.ln(6)
        
        # --- TABLO BAŞLIKLARI ---
        headers = ["Tarih", "İşlem", "Detay", "Has Altın (gr)", "Tutar", "Açıklama"]
        widths  = [32, 20, 35, 25, 28, 50]
        
        pdf.set_fill_color(241, 245, 249) # Tablo başlık arkaplanı
        pdf.set_draw_color(203, 213, 225)
        pdf.set_text_color(71, 85, 105)
        pdf.set_font("Corporate", "", 9)
        
        for i, h in enumerate(headers):
            pdf.cell(widths[i], 9, h, border="B", align="L" if i in [0, 1, 2, 5] else "R", fill=True)
        pdf.ln()
        
        # --- TABLO İÇERİĞİ ---
        pdf.set_font("Corporate", "", 8)
        pdf.set_draw_color(241, 245, 249) # İnce satır alt çizgisi
        
        fill = False
        for r in rows:
            # r: [id, islem_tipi, islem_detayi, has_altin, tl_tutar, usd_tutar, eur_tutar, aciklama, islem_tarihi]
            t_str = r[8].strftime("%d.%m.%Y %H:%M") if r[8] else "-"
            tip = str(r[1])
            detay = str(r[2] or "-")
            has_val = float(r[3] or 0)
            tl_val = float(r[4] or 0)
            usd_val = float(r[5] or 0)
            eur_val = float(r[6] or 0)
            aciklama = str(r[7] or "-")
            
            # Değerleri formatla
            if has_val != 0:
                has_str = f"{has_val:+.3f} gr".replace("+", "+ ") if has_val >= 0 else f"{has_val:.3f} gr"
            else:
                has_str = "-"
                
            if tl_val != 0:
                tl_str = f"{tl_val:+,.2f} TL".replace("+", "+ ").replace(",", "X").replace(".", ",").replace("X", ".") if tl_val >= 0 else f"{tl_val:,.2f} TL".replace(",", "X").replace(".", ",").replace("X", ".")
            elif usd_val != 0:
                tl_str = f"{usd_val:+,.2f} USD".replace("+", "+ ").replace(",", "X").replace(".", ",").replace("X", ".") if usd_val >= 0 else f"{usd_val:,.2f} USD".replace(",", "X").replace(".", ",").replace("X", ".")
            elif eur_val != 0:
                tl_str = f"{eur_val:+,.2f} EUR".replace("+", "+ ").replace(",", "X").replace(".", ",").replace("X", ".") if eur_val >= 0 else f"{eur_val:,.2f} EUR".replace(",", "X").replace(".", ",").replace("X", ".")
            else:
                tl_str = "-"
                
            vals = [t_str, tip, detay, has_str, tl_str, aciklama]
            
            pdf.set_fill_color(248, 250, 252) if fill else pdf.set_fill_color(255, 255, 255)
            
            for i, val in enumerate(vals):
                if i == 1: # İşlem Tipi Hücresi Renklendirme
                    if tip == "Borçlanma":
                        pdf.set_text_color(239, 68, 68) # Kırmızı
                    else:
                        pdf.set_text_color(16, 185, 129) # Yeşil
                elif i in [3, 4] and val != "-": # Has / Tutar Sütunları
                    if val.startswith("-"):
                        pdf.set_text_color(16, 185, 129) # Yeşil
                    else:
                        pdf.set_text_color(239, 68, 68) # Kırmızı
                else:
                    pdf.set_text_color(51, 65, 85) # Koyu Gri
                    
                align = "L" if i in [0, 1, 2, 5] else "R"
                pdf.cell(widths[i], 8, val, border="B", align=align, fill=fill)
            
            pdf.ln()
            fill = not fill
            
        report_path = f"toptanci_raporu_{toptanci_id}_{int(time.time())}.pdf"
        pdf.output(report_path)
        return FileResponse(report_path, filename=f"Capar_Kuyumculuk_{unvan.replace(' ', '_')}_Hesap_Ekstresi.pdf")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF oluşturulamadı: {e}")
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

# ─────────────────────────────────────────────
# ÜRÜN STOK YÖNETİMİ
# ─────────────────────────────────────────────

@app.get("/urun_stok")
def urun_stok_getir(urun_id: Optional[int] = None, sadece_satilmamis: bool = False):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        query = "SELECT id, urun_id, kod, ozellikler, maliyet_usd, satis_fiyati, satildi_mi, eklenme_tarihi, para_birimi FROM urun_stok WHERE 1=1"
        params = []
        if sadece_satilmamis:
            query += " AND satildi_mi = FALSE"
        if urun_id is not None:
            query += " AND urun_id = %s"
            params.append(urun_id)
            
        query += " ORDER BY eklenme_tarihi DESC"
        cursor.execute(query, tuple(params))
        
        rows = cursor.fetchall()
        return [
            {
                "id": r[0], "urun_id": r[1], "kod": r[2], "ozellikler": r[3],
                "maliyet_usd": float(r[4]), "satis_fiyati": float(r[5]),
                "satildi_mi": bool(r[6]), "eklenme_tarihi": r[7].isoformat() if r[7] else None,
                "para_birimi": r[8] or "USD" # 👈 BURA EKLENDİ
            } for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.post("/urun_stok", status_code=201)
async def urun_stok_ekle(model: UrunStokModel):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO urun_stok (urun_id, kod, ozellikler, maliyet_usd, satis_fiyati, para_birimi)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
    """, (model.urun_id, model.kod, model.ozellikler, model.maliyet_usd, model.satis_fiyati, model.para_birimi))
        stok_id = cursor.fetchone()[0]
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_URUN_STOK"}))
        return {"id": stok_id, "mesaj": "Stok başarıyla eklendi."}
    except psycopg2.IntegrityError:
        if conn: conn.rollback()
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.put("/urun_stok/{stok_id}")
async def urun_stok_guncelle(stok_id: int, payload: UrunStokGuncellePayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        alanlar = []
        degerler = []
        if payload.kod is not None:
            alanlar.append("kod = %s")
            degerler.append(payload.kod.strip())
        if payload.ozellikler is not None:
            alanlar.append("ozellikler = %s")
            degerler.append(payload.ozellikler)
        if payload.maliyet_usd is not None:
            alanlar.append("maliyet_usd = %s")
            degerler.append(payload.maliyet_usd)
        if payload.satis_fiyati is not None:
            alanlar.append("satis_fiyati = %s")
            degerler.append(payload.satis_fiyati)
        if payload.satildi_mi is not None:
            alanlar.append("satildi_mi = %s")
            degerler.append(payload.satildi_mi)
            
        if not alanlar:
            raise HTTPException(status_code=400, detail="Güncellenecek alan bulunamadı.")
            
        degerler.append(stok_id)
        cursor.execute(f"UPDATE urun_stok SET {', '.join(alanlar)} WHERE id = %s RETURNING id", tuple(degerler))
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Stok bulunamadı.")
        
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_URUN_STOK"}))
        return {"mesaj": "Başarıyla güncellendi."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.delete("/urun_stok/{stok_id}")
async def urun_stok_sil(stok_id: int):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM urun_stok WHERE id = %s RETURNING id", (stok_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Stok bulunamadı.")
        conn.commit()
        await manager.broadcast_text(json.dumps({"type": "REFRESH_URUN_STOK"}))
        return {"mesaj": "Silindi"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

# ─────────────────────────────────────────────
# MÜŞTERİ EMANET VE NOT APİ
# ─────────────────────────────────────────────

class MusteriEmanetPayload(BaseModel):
    musteri_adi: str
    telefon: Optional[str] = None
    not_detayi: str
    teslim_edildi_mi: bool = False
    kategori: Optional[str] = 'Genel'

@app.get("/musteri_emanetler")
def musteri_emanetleri_getir():
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, musteri_adi, telefon, not_detayi, teslim_edildi_mi, teslim_tarihi, olusturulma_tarihi, kategori
            FROM musteri_emanetler
            ORDER BY olusturulma_tarihi DESC
        """)
        rows = cursor.fetchall()
        return [
            {
                "id": r[0],
                "musteri_adi": r[1],
                "telefon": r[2],
                "not_detayi": r[3],
                "teslim_edildi_mi": r[4],
                "teslim_tarihi": r[5].isoformat() if r[5] else None,
                "olusturulma_tarihi": r[6].isoformat() if r[6] else None,
                "kategori": r[7] if len(r) > 7 else 'Genel'
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.post("/musteri_emanetler")
def musteri_emaneti_ekle(payload: MusteriEmanetPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO musteri_emanetler (musteri_adi, telefon, not_detayi, teslim_edildi_mi, teslim_tarihi, kategori)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (
            payload.musteri_adi,
            payload.telefon,
            payload.not_detayi,
            payload.teslim_edildi_mi,
            datetime.now() if payload.teslim_edildi_mi else None,
            payload.kategori
        ))
        new_id = cursor.fetchone()[0]
        conn.commit()
        return {"mesaj": "Müşteri emanet/not kaydı eklendi", "id": new_id}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.put("/musteri_emanetler/{id}")
def musteri_emaneti_guncelle(id: int, payload: MusteriEmanetPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        teslim_tarihi = datetime.now() if payload.teslim_edildi_mi else None
        
        cursor.execute("""
            UPDATE musteri_emanetler
            SET musteri_adi = %s, telefon = %s, not_detayi = %s, teslim_edildi_mi = %s, teslim_tarihi = %s, kategori = %s
            WHERE id = %s
        """, (payload.musteri_adi, payload.telefon, payload.not_detayi, payload.teslim_edildi_mi, teslim_tarihi, payload.kategori, id))
        
        conn.commit()
        return {"mesaj": "Kayıt güncellendi"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.delete("/musteri_emanetler/{id}")
def musteri_emaneti_sil(id: int):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM musteri_emanetler WHERE id = %s", (id,))
        conn.commit()
        return {"mesaj": "Kayıt silindi"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

# ─────────────────────────────────────────────
# ADMİN GİRİŞ VE GÜVENLİK SİSTEMİ
# ─────────────────────────────────────────────

class LoginPayload(BaseModel):
    email: str
    password: str

class ChangePasswordPayload(BaseModel):
    email: str
    current_password: str
    new_password: str

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

@app.post("/api/auth/login")
def auth_login(payload: LoginPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        email_clean = payload.email.lower().strip()
        cursor.execute("SELECT sifre_hash FROM yonetici WHERE email = %s", (email_clean,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
            
        hashed = hash_password(payload.password)
        if row[0] != hashed:
            raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
            
        return {"success": True, "email": email_clean}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.post("/api/auth/change-password")
def auth_change_password(payload: ChangePasswordPayload):
    conn = cursor = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        email_clean = payload.email.lower().strip()
        cursor.execute("SELECT sifre_hash FROM yonetici WHERE email = %s", (email_clean,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
            
        hashed_current = hash_password(payload.current_password)
        if row[0] != hashed_current:
            raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
            
        hashed_new = hash_password(payload.new_password)
        cursor.execute("UPDATE yonetici SET sifre_hash = %s WHERE email = %s", (hashed_new, email_clean))
        conn.commit()
        
        return {"success": True, "mesaj": "Şifre başarıyla değiştirildi"}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn: conn.close()