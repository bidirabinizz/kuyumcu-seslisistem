import { useEffect, useState } from 'react';
import { UserPlus, Shield, Mic, Edit2, Trash2, X, Check } from 'lucide-react';

const ROL_BADGE = {
  'Yönetici':   'bg-gold-100 text-gold-800 border-gold-200',
  'Tezgahtar':  'bg-ink-100 text-ink-700 border-ink-200',
  'Kuyumcu':    'bg-amber-100 text-amber-800 border-amber-200',
};

const BOSTA_PERSONEL = { ad_soyad: '', tetikleme_kelimesi: '', rol: 'Tezgahtar' };
const API_BASE = 'http://localhost:8000';

export const Kullanicilar = () => {
  const [personeller, setPersoneller] = useState([]);
  const [formAcik, setFormAcik]     = useState(false);
  const [yeniP, setYeniP]           = useState(BOSTA_PERSONEL);
  const [duzenleId, setDuzenleId]   = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata]             = useState('');
  const [istatistikler, setIstatistikler] = useState([]);
  const [seciliPerformans, setSeciliPerformans] = useState(null);

  const personelleriGetir = async () => {
    try {
      setHata('');
      const res = await fetch(`${API_BASE}/personeller`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Personeller yüklenemedi.');
      }
      setPersoneller(data);
    } catch (err) {
      setHata(err.message || 'Sunucu hatası oluştu.');
    } finally {
      setYukleniyor(false);
    }
  };

  const istatistikleriGetir = async () => {
    try {
      const res = await fetch(`${API_BASE}/personeller/istatistik`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'İstatistikler yüklenemedi.');
      setIstatistikler(data);
    } catch (err) {
      setHata(err.message || 'İstatistikler yüklenemedi.');
      setIstatistikler([]);
    }
  };

  useEffect(() => {
    personelleriGetir();
    istatistikleriGetir();
  }, []);

  const kaydet = async () => {
    if (!yeniP.ad_soyad || !yeniP.tetikleme_kelimesi) return;
    try {
      setHata('');
      const method = duzenleId !== null ? 'PUT' : 'POST';
      const url = duzenleId !== null
        ? `${API_BASE}/personeller/${duzenleId}`
        : `${API_BASE}/personeller`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(yeniP),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Kayıt işlemi başarısız.');
      }

      await personelleriGetir();
      await istatistikleriGetir();
      setDuzenleId(null);
      setYeniP(BOSTA_PERSONEL);
      setFormAcik(false);
    } catch (err) {
      setHata(err.message || 'Kayıt işlemi başarısız.');
    }
  };

  const duzenle = (p) => {
    setYeniP({ ad_soyad: p.ad_soyad, tetikleme_kelimesi: p.tetikleme_kelimesi, rol: p.rol });
    setDuzenleId(p.id);
    setFormAcik(true);
  };

  const sil = async (id) => {
    try {
      setHata('');
      const res = await fetch(`${API_BASE}/personeller/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Silme işlemi başarısız.');
      }
      await personelleriGetir();
      await istatistikleriGetir();
    } catch (err) {
      setHata(err.message || 'Silme işlemi başarısız.');
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-ink-900 tracking-tight">Personel Yönetimi</h1>
          <p className="text-sm text-ink-400 mt-0.5">Sesli komut yetkisi olan çalışanlar</p>
        </div>
        <button
          onClick={() => { setFormAcik(true); setDuzenleId(null); setYeniP(BOSTA_PERSONEL); }}
          className="flex items-center gap-2 bg-ink-800 hover:bg-ink-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95"
        >
          <UserPlus size={16} /> Personel Ekle
        </button>
      </div>

      {/* Form modal */}
      {formAcik && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fadeUp">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-lg text-ink-900">
                {duzenleId !== null ? 'Personeli Düzenle' : 'Yeni Personel'}
              </h2>
              <button onClick={() => setFormAcik(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-ink-500 uppercase tracking-wider block mb-1.5">Ad Soyad</label>
                <input
                  className="w-full border border-ink-200 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-800 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100 transition-all"
                  placeholder="Ahmet Yılmaz"
                  value={yeniP.ad_soyad}
                  onChange={e => setYeniP(p => ({ ...p, ad_soyad: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-ink-500 uppercase tracking-wider block mb-1.5">Sesli Tetikleme Kelimesi</label>
                <div className="relative">
                  <Mic size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    className="w-full border border-ink-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-mono font-bold text-ink-800 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100 transition-all"
                    placeholder="ahmet"
                    value={yeniP.tetikleme_kelimesi}
                    onChange={e => setYeniP(p => ({ ...p, tetikleme_kelimesi: e.target.value.toLowerCase() }))}
                  />
                </div>
                <p className="text-xs text-ink-400 mt-1">Küçük harf, boşluksuz</p>
              </div>
              <div>
                <label className="text-xs font-bold text-ink-500 uppercase tracking-wider block mb-1.5">Rol</label>
                <select
                  className="w-full border border-ink-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-800 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100 transition-all"
                  value={yeniP.rol}
                  onChange={e => setYeniP(p => ({ ...p, rol: e.target.value }))}
                >
                  <option>Yönetici</option>
                  <option>Tezgahtar</option>
                  <option>Kuyumcu</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setFormAcik(false)}
                className="flex-1 border border-ink-200 text-ink-600 font-bold py-2.5 rounded-xl text-sm hover:bg-ink-50 transition-all"
              >
                İptal
              </button>
              <button
                onClick={kaydet}
                className="flex-1 bg-ink-800 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-ink-900 transition-all flex items-center justify-center gap-2"
              >
                <Check size={15} /> Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personel kartları */}
      {hata && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {hata}
        </div>
      )}
      {yukleniyor && (
        <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2 text-sm font-semibold text-ink-600">
          Personeller yükleniyor...
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {personeller.map((p) => (
          <div key={p.id} className="bg-white border border-ink-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
            {(() => {
              const s = istatistikler.find((x) => x.id === p.id);
              return (
                <>
            <div className="flex justify-between items-start mb-4">
              <div className="w-11 h-11 rounded-2xl bg-ink-800 flex items-center justify-center shadow-md">
                <Shield size={20} className="text-gold-400" />
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => duzenle(p)}
                  className="w-8 h-8 rounded-lg bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 transition-all"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => sil(p.id)}
                  className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <h3 className="font-display text-lg font-bold text-ink-900 leading-tight">{p.ad_soyad}</h3>

            <span className={`inline-block mt-1 mb-4 px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${ROL_BADGE[p.rol] || 'bg-ink-100 text-ink-700 border-ink-200'}`}>
              {p.rol}
            </span>

            <div className="bg-ink-50 border border-dashed border-ink-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Mic size={11} className="text-ink-400" />
                <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Sesli Tetikleme</span>
              </div>
              <span className="font-mono font-black text-ink-800 text-sm">"{p.tetikleme_kelimesi}"</span>
            </div>

            <div className="mt-3 rounded-xl border border-gold-100 bg-gold-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gold-700">Performans</span>
                <span className="px-2 py-0.5 rounded-md bg-white border border-gold-200 text-[11px] font-black text-gold-800">
                  {(s?.performans_skor ?? 0).toFixed(1)}
                </span>
              </div>
              <div className="text-xs text-ink-600 space-y-1">
                <p>Alış Has: {(s?.toplam_alis_has ?? 0).toFixed(3)} gr</p>
                <p>Satış Has: {(s?.toplam_satis_has ?? 0).toFixed(3)} gr</p>
                <p>İşlem: {s?.islem_sayisi ?? 0} adet</p>
              </div>
              <button
                onClick={() => setSeciliPerformans({ personel: p, stats: s })}
                className="mt-2 w-full rounded-lg bg-ink-800 text-white text-xs font-bold py-2 hover:bg-ink-900 transition-all"
              >
                Performansı Gör
              </button>
            </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>

      {seciliPerformans && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg text-ink-900">
                {seciliPerformans.personel.ad_soyad} · Performans Detayı
              </h3>
              <button onClick={() => setSeciliPerformans(null)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-400">Toplam Alış (Has)</p>
                <p className="font-mono font-black text-ink-900">{(seciliPerformans.stats?.toplam_alis_has ?? 0).toFixed(3)} gr</p>
              </div>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-400">Toplam Satış (Has)</p>
                <p className="font-mono font-black text-ink-900">{(seciliPerformans.stats?.toplam_satis_has ?? 0).toFixed(3)} gr</p>
              </div>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-400">Net Has</p>
                <p className="font-mono font-black text-ink-900">{(seciliPerformans.stats?.net_has ?? 0).toFixed(3)} gr</p>
              </div>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-400">Toplam TL Hacim</p>
                <p className="font-mono font-black text-ink-900">{(seciliPerformans.stats?.toplam_tl_hacim ?? 0).toFixed(2)} TL</p>
              </div>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-400">İşlem Sayısı</p>
                <p className="font-mono font-black text-ink-900">{seciliPerformans.stats?.islem_sayisi ?? 0}</p>
              </div>
              <div className="rounded-xl border border-gold-200 bg-gold-50 p-3">
                <p className="text-xs text-gold-700">Performans Skoru</p>
                <p className="font-mono font-black text-gold-900">{(seciliPerformans.stats?.performans_skor ?? 0).toFixed(1)} / 100</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
