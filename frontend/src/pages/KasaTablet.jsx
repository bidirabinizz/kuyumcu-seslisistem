import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE, WS_BASE } from '../apiConfig';
import { NumPad } from '../components/NumPad';
import { ChevronLeft, CheckCircle2, Loader2, AlertCircle, X, Package, Tag, PackageOpen } from 'lucide-react';

// ─── Renk sistemi (Urunler.jsx ile tutarlı, dark bg üzerine) ────────────────
const TABLET_RENK = {
  yellow: { bg: 'bg-yellow-400/20',  border: 'border-yellow-400/60',  text: 'text-yellow-300',  active: 'bg-yellow-400 border-yellow-400 text-gray-900' },
  amber:  { bg: 'bg-amber-400/20',   border: 'border-amber-400/60',   text: 'text-amber-300',   active: 'bg-amber-400 border-amber-400 text-gray-900' },
  orange: { bg: 'bg-orange-400/20',  border: 'border-orange-400/60',  text: 'text-orange-300',  active: 'bg-orange-400 border-orange-400 text-gray-900' },
  red:    { bg: 'bg-red-400/20',     border: 'border-red-400/60',     text: 'text-red-300',     active: 'bg-red-400 border-red-400 text-gray-900' },
  purple: { bg: 'bg-purple-400/20',  border: 'border-purple-400/60',  text: 'text-purple-300',  active: 'bg-purple-400 border-purple-400 text-gray-900' },
  blue:   { bg: 'bg-blue-400/20',    border: 'border-blue-400/60',    text: 'text-blue-300',    active: 'bg-blue-400 border-blue-400 text-gray-900' },
  green:  { bg: 'bg-green-400/20',   border: 'border-green-400/60',   text: 'text-green-300',   active: 'bg-green-400 border-green-400 text-gray-900' },
  gray:   { bg: 'bg-gray-400/20',    border: 'border-gray-400/60',    text: 'text-gray-300',    active: 'bg-gray-300 border-gray-300 text-gray-900' },
};

const renk = (key, aktif) => {
  const r = TABLET_RENK[key] || TABLET_RENK.amber;
  return aktif ? r.active : `${r.bg} ${r.border} ${r.text}`;
};

// ─── Adım 1: Personel Seçimi ────────────────────────────────────────────────
function PersonelSec({ onSec, personeller = [], loading = false }) {
  const initials = (ad) => ad.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-10 pb-6">
        <p className="text-amber-400 text-xs font-bold tracking-[0.25em] uppercase mb-2">Çapar Kuyumculuk · Kasa</p>
        <h1 className="text-white text-3xl font-black">Kim işlem yapıyor?</h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="text-amber-400 animate-spin" />
        </div>
      ) : personeller.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
          <AlertCircle size={40} />
          <p className="text-lg font-semibold">Personel bulunamadı</p>
          <p className="text-sm">Önce admin panelinden personel ekleyin.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="grid grid-cols-2 gap-4">
            {personeller.map(p => (
              <button
                key={p.id}
                onClick={() => onSec(p)}
                className="flex flex-col items-center gap-4 p-6 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-amber-400/40 active:scale-95 transition-all group"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <span className="text-gray-900 text-xl font-black">{initials(p.ad_soyad)}</span>
                </div>
                <div className="text-center">
                  <p className="text-white font-bold text-base leading-tight">{p.ad_soyad}</p>
                  {p.rol && <p className="text-gray-500 text-xs mt-0.5">{p.rol}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Adım 2: İşlem Girişi ─────────────────────────────────────────────────────
function IslemGir({ personel, onGeri, onDevam, urunler = [], kategoriler = [], urunStok = [], loading = false }) {
  const [secilenUrun, setSecilenUrun] = useState(null);
  const [islemTipi, setIslemTipi]   = useState('SATIS');
  const [odemeTipi, setOdemeTipi]   = useState('NAKIT');
  const [miktar, setMiktar]         = useState('');
  const [fiyat, setFiyat]           = useState('');
  const [aktifInput, setAktifInput] = useState('miktar'); // 'miktar' | 'fiyat'
  const [seciliUrunStokId, setSeciliUrunStokId] = useState('');
  const [seciliStokKodu, setSeciliStokKodu] = useState('');
  const [showStokSecim, setShowStokSecim] = useState(false);

  const selectProduct = (u) => {
    setSecilenUrun(u);
    if (u.stok_takibi && islemTipi === 'SATIS') {
      setMiktar('');
      setSeciliUrunStokId('');
      setSeciliStokKodu('');
      setAktifInput('fiyat');
      setShowStokSecim(true);
    } else {
      setMiktar('');
      setSeciliUrunStokId('');
      setSeciliStokKodu('');
      setAktifInput('miktar');
    }
  };

  const selectIslemTipi = (t) => {
    setIslemTipi(t);
    if (t === 'SATIS' && secilenUrun?.stok_takibi) {
      setMiktar('');
      setSeciliUrunStokId('');
      setSeciliStokKodu('');
      setAktifInput('fiyat');
      setShowStokSecim(true);
    } else {
      setMiktar('');
      setSeciliUrunStokId('');
      setSeciliStokKodu('');
      setAktifInput('miktar');
    }
  };

  useEffect(() => {
    if (urunler.length > 0) {
      if (!secilenUrun || !urunler.some(u => u.id === secilenUrun.id)) {
        setSecilenUrun(urunler[0]);
      } else {
        const updated = urunler.find(u => u.id === secilenUrun.id);
        if (updated) {
          setSecilenUrun(updated);
        }
      }
    } else {
      setSecilenUrun(null);
    }
  }, [urunler]);

  const handleDevam = () => {
    const isStoklu = secilenUrun?.stok_takibi === true;
    const miktarValue = isStoklu ? 1 : parseFloat(miktar);

    if (!secilenUrun || (!isStoklu && (!miktar || miktarValue <= 0))) return;
    if (isStoklu && islemTipi === 'SATIS' && !seciliUrunStokId) {
      alert("Lütfen stok kodu seçin!");
      return;
    }

    onDevam({
      personel,
      urun: secilenUrun,
      islemTipi,
      odemeTipi,
      miktar: miktarValue,
      fiyat: parseFloat(fiyat) || 0,
      urun_stok_id: isStoklu && islemTipi === 'SATIS' && seciliUrunStokId ? parseInt(seciliUrunStokId) : null
    });
  };

  const devamAktif = secilenUrun && (secilenUrun.stok_takibi === true ? (islemTipi === 'SATIS' ? seciliUrunStokId : true) : (miktar && parseFloat(miktar) > 0));

  // Gruplama (Favoriler en üste)
  const gruplar = urunler.reduce((acc, u) => {
    if (u.favori) {
      if (!acc["FAVORİLER"]) acc["FAVORİLER"] = [];
      acc["FAVORİLER"].push(u);
    }
    const k = u.urun_kategorisi;
    if (!acc[k]) acc[k] = [];
    acc[k].push(u);
    return acc;
  }, {});

  // Dinamik kategori sıralaması ve etiketleri
  const baseSira = kategoriler.length > 0
    ? kategoriler.map(k => k.ad)
    : Object.keys(gruplar).filter(k => k !== "FAVORİLER");
    
  const grupSirasi = ["FAVORİLER", ...baseSira].filter(g => gruplar[g]);
  const grupEtiket = kategoriler.reduce((acc, k) => { acc[k.ad] = k.etiket; return acc; }, {});
  grupEtiket["FAVORİLER"] = "⭐ Favoriler";

  return (
    <div className="flex flex-col h-full">
      {/* Üst bar */}
      <div className="flex items-center gap-4 px-6 pt-6 pb-4 border-b border-white/5">
        <button
          onClick={onGeri}
          className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-all"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <span className="text-gray-900 text-xs font-black">
              {personel.ad_soyad.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </span>
          </div>
          <span className="text-white font-semibold">{personel.ad_soyad}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sol: Ürün seçimi */}
        <div className="w-[55%] border-r border-white/5 flex flex-col overflow-hidden">
          {/* ALIŞ / SATIŞ */}
          <div className="grid grid-cols-2 gap-2 p-4">
            {[
              { val: 'SATIS', label: '↓ SATIŞ', cls: islemTipi === 'SATIS' ? 'bg-red-500 border-red-500 text-white' : 'bg-red-500/10 border-red-500/30 text-red-400' },
              { val: 'ALIS',  label: '↑ ALIŞ',  cls: islemTipi === 'ALIS'  ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
            ].map(({ val, label, cls }) => (
              <button
                key={val}
                onClick={() => selectIslemTipi(val)}
                className={`py-3.5 rounded-2xl border-2 font-black text-sm tracking-wide transition-all active:scale-95 ${cls}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Ürün listesi (gruplu) */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center pt-12">
                <Loader2 size={28} className="text-amber-400 animate-spin" />
              </div>
            ) : grupSirasi.map(grup => {
              if (!gruplar[grup] || gruplar[grup].length === 0) return null;
              return (
                <div key={grup}>
                  <p className="text-gray-600 text-[10px] font-bold tracking-[0.2em] uppercase mb-2 px-1">
                    {grupEtiket[grup] || grup}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {gruplar[grup].map(u => {
                      const aktif = secilenUrun?.id === u.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => selectProduct(u)}
                          className={`
                            /* BUTON YÜKSEKLİĞİNİ BURADAN AYARLAYABİLİRSİNİZ (Örn: py-3.5 yerine h-20 veya py-5 yazabilirsiniz) */
                            py-3.5 px-3 rounded-2xl border-2 font-bold text-sm text-center
                            transition-all active:scale-95 leading-tight
                            ${renk(u.renk, aktif)}
                          `}
                        >
                          {u.ad}
                          {u.milyem > 0 && (
                            <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                              %{(u.milyem * 100).toFixed(1)} has
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sağ: Numpad + Miktar + Fiyat */}
        <div className="flex-1 flex flex-col p-4 gap-3">
          {/* Seçilen ürün header */}
          {secilenUrun && (
            <div className={`px-3 py-2 rounded-xl border text-sm font-semibold text-center ${renk(secilenUrun.renk, true)}`}>
              {secilenUrun.ad}
            </div>
          )}

          {/* Miktar / Fiyat input göstergesi */}
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                key: 'miktar',
                label: secilenUrun?.stok_takibi === true && islemTipi === 'SATIS'
                  ? 'Stok Kodu'
                  : (secilenUrun?.islem_birimi === 'ADET' || secilenUrun?.stok_takibi === true ? 'Adet' : 'Gram'),
                val: secilenUrun?.stok_takibi === true && islemTipi === 'SATIS'
                  ? (seciliStokKodu || 'Seçiniz')
                  : miktar,
                onClick: () => {
                  if (secilenUrun?.stok_takibi === true && islemTipi === 'SATIS') {
                    setShowStokSecim(true);
                  } else {
                    setAktifInput('miktar');
                  }
                }
              },
              {
                key: 'fiyat',
                label: 'Fiyat (₺)',
                val: fiyat,
                onClick: () => setAktifInput('fiyat')
              },
            ].map(({ key, label, val, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`relative px-3 py-2.5 rounded-2xl border-2 text-left transition-all ${
                  aktifInput === key && !(secilenUrun?.stok_takibi === true && islemTipi === 'SATIS' && key === 'miktar')
                    ? 'border-amber-400 bg-amber-400/10'
                    : 'border-white/10 bg-white/5'
                } ${
                  secilenUrun?.stok_takibi === true && islemTipi === 'SATIS' && key === 'miktar'
                    ? 'border-amber-400/30 bg-amber-400/5'
                    : ''
                }`}
              >
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide">{label}</p>
                <p className={`font-black text-lg mt-0.5 truncate ${
                  (val && val !== 'Seçiniz') ? 'text-white' : 'text-gray-700'
                }`}>
                  {val || '0'}
                </p>
                {aktifInput === key && !(secilenUrun?.stok_takibi === true && islemTipi === 'SATIS' && key === 'miktar') && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-400 animate-pulse" />
                )}
              </button>
            ))}
          </div>

          {/* NumPad */}
          <div className="flex-1 flex flex-col justify-center">
            <NumPad
              value={aktifInput === 'miktar' ? miktar : fiyat}
              onChange={(v) => aktifInput === 'miktar' ? setMiktar(v) : setFiyat(v)}
              decimal={aktifInput === 'miktar' ? secilenUrun?.islem_birimi !== 'ADET' && secilenUrun?.stok_takibi !== true : true}
            />
          </div>

          {/* NAKİT / KART / USD / EUR */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'NAKIT', label: '💵 Nakit TL', cls: odemeTipi === 'NAKIT' ? 'bg-emerald-600/80 border-emerald-500 text-white' : 'bg-white/5 border-white/10 text-gray-500' },
              { val: 'KART',  label: '💳 Kart TL',  cls: odemeTipi === 'KART'  ? 'bg-blue-600/80 border-blue-500 text-white'         : 'bg-white/5 border-white/10 text-gray-500' },
              { val: 'USD',   label: '💵 USD ($)',  cls: odemeTipi === 'USD'   ? 'bg-amber-600/80 border-amber-500 text-white'       : 'bg-white/5 border-white/10 text-gray-500' },
              { val: 'EUR',   label: '💵 EUR (€)',  cls: odemeTipi === 'EUR'   ? 'bg-purple-600/80 border-purple-500 text-white'     : 'bg-white/5 border-white/10 text-gray-500' },
            ].map(({ val, label, cls }) => (
              <button
                key={val}
                type="button"
                onClick={() => setOdemeTipi(val)}
                className={`py-3 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95 ${cls}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Devam butonu */}
          <button
            onClick={handleDevam}
            disabled={!devamAktif}
            className={`py-4 rounded-2xl font-black text-base tracking-wide transition-all active:scale-95 ${
              devamAktif
                ? 'bg-amber-400 text-gray-900 shadow-lg shadow-amber-500/30'
                : 'bg-white/5 text-gray-700 cursor-not-allowed'
            }`}
          >
            İleri → Onayla
          </button>
        </div>
      </div>

      {/* Stok Seçim Modalı */}
      {showStokSecim && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0b0f19] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center text-amber-400">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">{secilenUrun?.ad}</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Lütfen satılacak stok kodunu seçin</p>
                </div>
              </div>
              <button
                onClick={() => setShowStokSecim(false)}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              {(() => {
                const stokListe = urunStok.filter(s => s.urun_id === secilenUrun?.id);
                if (stokListe.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <PackageOpen size={48} className="text-gray-600 mb-3" />
                      <p className="text-gray-400 text-sm font-semibold">Aktif Stok Bulunamadı</p>
                      <p className="text-gray-600 text-xs mt-1 max-w-[200px]">Lütfen önce admin panelinden stok girişi yapın.</p>
                    </div>
                  );
                }
                return stokListe.map(s => {
                  const kod = s.kod || `Stok #${s.id}`;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSeciliUrunStokId(s.id.toString());
                        setSeciliStokKodu(kod);
                        if (s.satis_fiyati) {
                          setFiyat(s.satis_fiyati.toString());
                        }
                        setShowStokSecim(false);
                      }}
                      className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-amber-400/10 border border-white/5 hover:border-amber-400/30 rounded-2xl transition-all group text-left active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3">
                        <Tag size={16} className="text-gray-500 group-hover:text-amber-400 transition-colors" />
                        <span className="text-white font-bold group-hover:text-amber-300 transition-colors">{kod}</span>
                      </div>
                      {s.satis_fiyati ? (
                        <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 font-bold text-xs rounded-full border border-emerald-500/20">
                          ₺{s.satis_fiyati.toLocaleString('tr-TR')}
                        </span>
                      ) : (
                        <span className="px-3 py-1.5 bg-gray-500/10 text-gray-400 font-medium text-[10px] rounded-full">
                          Fiyatsız
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Adım 3: Onay ─────────────────────────────────────────────────────────────
function IslemOnayla({ data, onGeri, onTamamlandi, kurlar }) {
  const [loading, setLoading]   = useState(false);
  const [basarili, setBasarili] = useState(false);
  const [hata, setHata]         = useState('');

  const { personel, urun, islemTipi, odemeTipi, miktar, fiyat, urun_stok_id } = data;

  // Has hesaplama önizlemesi
  let hasGoster = null;
  if (urun.milyem > 0) {
    hasGoster = (miktar * urun.milyem).toFixed(4) + ' gr has';
  } else if (urun.has_karsiligi > 0) {
    hasGoster = (miktar * urun.has_karsiligi).toFixed(4) + ' gr has';
  }

  // Döviz karşılığı hesaplama
  let dovizGoster = null;
  let computedDovizTutar = 0.0;
  let computedDovizKuru = 1.0;

  const isDoviz = urun.urun_kategorisi === 'DÖVİZ' || urun.urun_kategorisi === 'DOVIZ';
  let dovizBozmaDetay = null;
  if (isDoviz && miktar > 0) {
    const birimDovizKuru = (fiyat / miktar).toFixed(4);
    dovizBozmaDetay = `${miktar} ${urun.urun_cinsi} ➔ ${fiyat.toLocaleString('tr-TR')} ₺ | 1 ${urun.urun_cinsi} = ${birimDovizKuru} ₺`;
  }

  if (!isDoviz) {
    if (odemeTipi === 'USD' && fiyat > 0) {
      computedDovizKuru = kurlar?.usd_try || 1.0;
      computedDovizTutar = fiyat / computedDovizKuru;
      dovizGoster = computedDovizTutar.toFixed(2) + ' USD ($)';
    } else if (odemeTipi === 'EUR' && fiyat > 0) {
      computedDovizKuru = kurlar?.eur_try || 1.0;
      computedDovizTutar = fiyat / computedDovizKuru;
      dovizGoster = computedDovizTutar.toFixed(2) + ' EUR (€)';
    }
  }

  const handleKaydet = async () => {
    setLoading(true);
    setHata('');
    try {
      const payload = {
        personel_id:              personel.id,
        islem_tipi:               islemTipi,
        urun_cinsi:               urun.urun_cinsi,
        urun_kategorisi:          urun.urun_kategorisi,
        islem_birimi:             urun.islem_birimi,
        brut_miktar:              miktar,
        birim_fiyat:              fiyat,
        odeme_tipi:               odemeTipi,
        adet:                     urun.islem_birimi === 'ADET' ? Math.round(miktar) : 1,
        milyem_override:          urun.milyem || null,
        has_karsiligi_override:   urun.has_karsiligi || null,
        urun_adi:                 urun.ad,
        doviz_tutar:              isDoviz ? miktar : (Math.round(computedDovizTutar * 100) / 100),
        doviz_kuru:               isDoviz ? (miktar > 0 ? (fiyat / miktar) : 1.0) : computedDovizKuru,
        urun_stok_id:             urun_stok_id,
      };
      await axios.post(`${API_BASE}/islemler`, payload);
      setBasarili(true);
      setTimeout(() => onTamamlandi(), 2000);
    } catch (err) {
      setHata(err.response?.data?.detail || 'Kayıt başarısız oldu.');
      setLoading(false);
    }
  };

  if (basarili) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
        <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center animate-pulse">
          <CheckCircle2 size={48} className="text-emerald-400" />
        </div>
        <div className="text-center">
          <p className="text-emerald-400 text-2xl font-black mb-1">Kaydedildi!</p>
          <p className="text-gray-500 text-sm">Personel seçimine dönülüyor...</p>
        </div>
      </div>
    );
  }

  const ALTI_RENK   = islemTipi === 'SATIS' ? 'bg-red-500/10 border-red-400/30 text-red-400'         : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-400';
  const ODEME_RENK  = odemeTipi === 'KART'  ? 'bg-blue-500/10 border-blue-400/30 text-blue-400'       : odemeTipi === 'USD' ? 'bg-amber-500/10 border-amber-400/30 text-amber-400' : odemeTipi === 'EUR' ? 'bg-purple-500/10 border-purple-400/30 text-purple-400' : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-400';

  return (
    <div className="flex flex-col h-full px-6 py-6 gap-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onGeri}
          className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-all"
        >
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-white text-xl font-black">İşlemi Onayla</h2>
      </div>

      {/* Özet kart */}
      <div className="flex-1 flex items-center">
        <div className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
          {/* Personel */}
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <span className="text-gray-900 text-sm font-black">
                {personel.ad_soyad.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-white font-bold">{personel.ad_soyad}</p>
              {personel.rol && <p className="text-gray-500 text-xs">{personel.rol}</p>}
            </div>
          </div>

          {/* Detaylar */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`px-4 py-3 rounded-2xl border-2 ${ALTI_RENK}`}>
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-wide mb-1">İşlem</p>
              <p className="font-black text-lg">{islemTipi === 'SATIS' ? '↓ SATIŞ' : '↑ ALIŞ'}</p>
            </div>
            <div className={`px-4 py-3 rounded-2xl border-2 ${renk(urun.renk, false).replace('text-', 'text-')} bg-white/5 border-white/10`}>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Ürün</p>
              <p className="font-black text-lg text-white leading-tight">{urun.ad}</p>
            </div>
            <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                {urun.islem_birimi === 'ADET' ? 'Adet' : 'Miktar'}
              </p>
              <p className="font-black text-2xl text-white">
                {urun.islem_birimi === 'ADET' ? Math.round(miktar) : miktar}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  {urun.islem_birimi === 'ADET' ? 'adet' : 'gr'}
                </span>
              </p>
            </div>
            <div className={`px-4 py-3 rounded-2xl border-2 ${ODEME_RENK}`}>
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-wide mb-1">Ödeme</p>
              <p className="font-black text-lg">{odemeTipi === 'KART' ? '💳 Kart TL' : odemeTipi === 'USD' ? '💵 USD ($)' : odemeTipi === 'EUR' ? '💵 EUR (€)' : '💵 Nakit TL'}</p>
            </div>
          </div>

          {/* Döviz Bozma / Değişim Detayı veya Standart Fiyat */}
          {isDoviz && dovizBozmaDetay ? (
            <div className="px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-wide mb-1">Döviz İşlem Detayı</p>
              <p className="font-black text-lg text-emerald-300">
                {dovizBozmaDetay}
              </p>
            </div>
          ) : (
            <>
              {/* Fiyat */}
              {fiyat > 0 && (
                <div className="px-4 py-3 rounded-2xl bg-amber-400/10 border border-amber-400/30">
                  <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wide mb-1">Toplam Fiyat</p>
                  <p className="font-black text-2xl text-amber-300">
                    {fiyat.toLocaleString('tr-TR')} ₺
                  </p>
                </div>
              )}

              {/* Döviz Tutarı */}
              {dovizGoster && (
                <div className="px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wide mb-1">Ödenecek Döviz Tutarı</p>
                  <p className="font-black text-2xl text-amber-300">
                    {dovizGoster}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1 font-mono">Sistem Kuru: {computedDovizKuru} TL</p>
                </div>
              )}
            </>
          )}

          {/* Has karşılığı */}
          {hasGoster && (
            <p className="text-center text-gray-600 text-xs">
              ≈ <span className="text-gray-400 font-semibold">{hasGoster}</span> altın karşılığı
            </p>
          )}
        </div>
      </div>

      {hata && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm">
          <AlertCircle size={16} />
          {hata}
        </div>
      )}

      {/* Butonlar */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onGeri}
          className="py-4 rounded-2xl bg-white/5 border border-white/10 text-gray-400 font-bold transition-all active:scale-95 hover:bg-white/10"
        >
          ← Geri
        </button>
        <button
          onClick={handleKaydet}
          disabled={loading}
          className="py-4 rounded-2xl bg-emerald-500 text-white font-black text-base transition-all active:scale-95 hover:bg-emerald-600 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          KAYDET
        </button>
      </div>
    </div>
  );
}

// ─── ANA BİLEŞEN ─────────────────────────────────────────────────────────────
export default function KasaTablet() {
  const [adim, setAdim]               = useState(1);  // 1 | 2 | 3
  const [personel, setPersonel]       = useState(null);
  const [islemData, setIslemData]     = useState(null);
  const [kurlar, setKurlar]           = useState(null);
  const [urunler, setUrunler]         = useState([]);
  const [kategoriler, setKategoriler] = useState([]);
  const [personeller, setPersoneller] = useState([]);
  const [urunStok, setUrunStok] = useState([]);
  const [loading, setLoading]         = useState(true);

  const yukleUrunlerVeKategoriler = useCallback(async () => {
    try {
      const [urunRes, katRes, stokRes] = await Promise.all([
        axios.get(`${API_BASE}/urunler`),
        axios.get(`${API_BASE}/kategoriler`),
        axios.get(`${API_BASE}/urun_stok?sadece_satilmamis=true`)
      ]);
      const mobilUrunler = urunRes.data.filter(u => u.mobil_aktif !== false);
      setUrunler(mobilUrunler);
      setKategoriler(katRes.data);
      setUrunStok(stokRes.data);
    } catch (err) {
      console.error('KasaTablet ürünler/kategoriler yüklenemedi:', err);
    }
  }, []);

  const yuklePersoneller = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/personeller`);
      setPersoneller(res.data);
    } catch (err) {
      console.error('KasaTablet personeller yüklenemedi:', err);
    }
  }, []);

  const yukleKurlar = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/piyasa/kurlar`);
      setKurlar(res.data);
    } catch (err) {
      console.error('KasaTablet kurlar alınamadı:', err);
    }
  }, []);

  // İlk yükleme
  useEffect(() => {
    setLoading(true);
    Promise.all([
      yukleUrunlerVeKategoriler(),
      yuklePersoneller(),
      yukleKurlar(),
    ]).finally(() => setLoading(false));
  }, [yukleUrunlerVeKategoriler, yuklePersoneller, yukleKurlar]);

  // WebSocket ile canlı güncelleme dinleyicisi
  useEffect(() => {
    let ws = null;
    let timeoutId = null;

    function connect() {
      console.log('[WS] KasaTablet bağlantısı başlatılıyor...', WS_BASE);
      ws = new WebSocket(WS_BASE);

      ws.onopen = () => {
        console.log('✅ KasaTablet WebSocket Bağlantısı Başarılı');
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] KasaTablet mesaj alındı:', data);
          if (data.type === 'REFRESH_URUNLER') {
            yukleUrunlerVeKategoriler();
          } else if (data.type === 'REFRESH_KATEGORILER') {
            yukleUrunlerVeKategoriler();
          } else if (data.type === 'REFRESH_URUN_STOK') {
            yukleUrunlerVeKategoriler();
          } else if (data.type === 'REFRESH_PERSONELLER') {
            yuklePersoneller();
          } else if (data.type === 'REFRESH_KURLAR') {
            yukleKurlar();
          }
        } catch (err) {
          console.error('[WS] Hata:', err);
        }
      };

      ws.onclose = () => {
        console.log('❌ KasaTablet WebSocket Bağlantısı Kapandı, tekrar bağlanılıyor...');
        timeoutId = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WS] Hata:', err);
        ws.close();
      };
    }

    connect();

    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [yukleUrunlerVeKategoriler, yuklePersoneller, yukleKurlar]);

  // Adım her değiştiğinde kurları da tazeleyelim
  useEffect(() => {
    yukleKurlar();
  }, [adim, yukleKurlar]);

  const handlePersonelSec = (p) => { setPersonel(p); setAdim(2); };
  const handleGeriPersonel = () => { setPersonel(null); setAdim(1); };
  const handleDevam = (data) => { setIslemData(data); setAdim(3); };
  const handleGeriIslem = () => setAdim(2);
  const handleTamamlandi = () => { setPersonel(null); setIslemData(null); setAdim(1); };

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] overflow-hidden flex flex-col">
      {/* Adım göstergesi */}
      <div className="flex gap-1.5 px-6 pt-3">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={`h-1 rounded-full transition-all duration-300 ${
              s <= adim ? 'bg-amber-400' : 'bg-white/10'
            } ${s === 1 ? 'flex-[1]' : s === 2 ? 'flex-[2]' : 'flex-[1]'}`}
          />
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {adim === 1 && <PersonelSec onSec={handlePersonelSec} personeller={personeller} loading={loading} />}
        {adim === 2 && personel && (
          <IslemGir
            personel={personel}
            onGeri={handleGeriPersonel}
            onDevam={handleDevam}
            urunler={urunler}
            kategoriler={kategoriler}
            urunStok={urunStok}
            loading={loading}
          />
        )}
        {adim === 3 && islemData && (
          <IslemOnayla data={islemData} onGeri={handleGeriIslem} onTamamlandi={handleTamamlandi} kurlar={kurlar} />
        )}
      </div>
    </div>
  );
}
