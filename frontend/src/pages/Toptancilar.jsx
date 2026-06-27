import { useState, useEffect } from 'react';
import { Building2, Plus, Phone, Trash2, Search, ArrowRight, AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InfoTooltip } from '../components/InfoTooltip';
import { API_BASE } from '../apiConfig';

export const Toptancilar = () => {
  const [toptancilar, setToptancilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAcik, setModalAcik] = useState(false);
  const [yeniToptanci, setYeniToptanci] = useState({ unvan: '', telefon: '', aciklama: '' });
  const [arama, setArama] = useState('');

  // Güvenli Silme State'leri
  const [silSeciliToptanci, setSilSeciliToptanci] = useState(null);
  const [silOnayAdim, setSilOnayAdim] = useState(0); // 0: kapalı, 1: unvan girme, 2: emin misin?
  const [silGirisUnvan, setSilGirisUnvan] = useState('');
  const [silLoading, setSilLoading] = useState(false);
  const [silHata, setSilHata] = useState('');

  const handleSilmeBaslat = (t) => {
    setSilSeciliToptanci(t);
    setSilOnayAdim(1);
    setSilGirisUnvan('');
    setSilHata('');
  };

  const handleSilmeOnaylaAdim1 = (e) => {
    e.preventDefault();
    if (silGirisUnvan.trim() !== silSeciliToptanci.unvan.trim()) {
      setSilHata('Firma adı eşleşmiyor. Lütfen tam olarak aynısını giriniz.');
      return;
    }
    setSilHata('');
    setSilOnayAdim(2);
  };

  const handleSilmeTamamla = async () => {
    setSilLoading(true);
    setSilHata('');
    try {
      const res = await fetch(`${API_BASE}/toptancilar/${silSeciliToptanci.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error('Toptancı silinemedi.');
      }
      setSilOnayAdim(0);
      setSilSeciliToptanci(null);
      fetchToptancilar();
    } catch (err) {
      setSilHata(err.message || 'Bir hata oluştu.');
    } finally {
      setSilLoading(false);
    }
  };

  const fetchToptancilar = async () => {
    try {
      const res = await fetch(`${API_BASE}/toptancilar`);
      if (!res.ok) throw new Error('Veri alınamadı');
      const data = await res.json();
      setToptancilar(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchToptancilar();
  }, []);

  const handleEkle = async (e) => {
    e.preventDefault();
    if (!yeniToptanci.unvan.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/toptancilar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(yeniToptanci)
      });
      if (res.ok) {
        setModalAcik(false);
        setYeniToptanci({ unvan: '', telefon: '', aciklama: '' });
        fetchToptancilar();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filtreliListe = toptancilar.filter(t => t.unvan.toLowerCase().includes(arama.toLowerCase()));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="animate-fadeIn">
        {/* BAŞLIK */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-ink-900 font-display tracking-tight flex items-center gap-2">
              <Building2 className="text-gold-500" />
              Toptancı Cari Takibi
            </h1>
            <p className="text-sm text-ink-500 mt-1">Toptancı ve çantacılarınızın has altın ve TL bakiyelerini yönetin.</p>
          </div>
          <button
            onClick={() => setModalAcik(true)}
            className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-5 py-2.5 rounded-none font-bold shadow-lg shadow-gold-500/20 transition-all active:scale-95"
          >
            <Plus size={18} strokeWidth={3} />
            Yeni Toptancı Ekle
          </button>
        </div>

        {/* ARAMA ÇUBUĞU */}
        <div className="bg-white p-4 border premium-border premium-shadow mb-6 flex items-center gap-3">
          <Search size={18} className="text-ink-400" />
          <input
            type="text"
            placeholder="Toptancı adı ile ara..."
            className="bg-transparent flex-1 text-sm font-semibold text-ink-900 outline-none placeholder:text-ink-400"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </div>

        {/* LİSTE */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 bg-ink-50 animate-pulse border premium-border" />
            ))}
          </div>
        ) : filtreliListe.length === 0 ? (
          <div className="bg-white border premium-border p-12 text-center">
            <Building2 size={48} className="mx-auto text-ink-200 mb-4" />
            <h3 className="text-lg font-bold text-ink-900">Kayıt Bulunamadı</h3>
            <p className="text-ink-500 text-sm mt-1">Sistemde toptancı kaydı yok veya aramaya uygun sonuç çıkmadı.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtreliListe.map(t => (
              <div key={t.id} className="bg-white border premium-border premium-shadow group hover:border-gold-500/50 transition-colors flex flex-col">
                <div className="p-5 border-b border-ink-50 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-ink-900 leading-tight">{t.unvan}</h3>
                    <div className="w-8 h-8 bg-ink-50 flex items-center justify-center text-ink-400">
                      <Building2 size={16} />
                    </div>
                  </div>
                  {t.telefon && (
                    <div className="flex items-center gap-2 text-sm text-ink-500 font-medium mb-2">
                      <Phone size={14} /> {t.telefon}
                    </div>
                  )}
                  {t.aciklama && (
                    <p className="text-xs text-ink-400 line-clamp-2 mb-4">{t.aciklama}</p>
                  )}
                  
                  {/* Bakiye Özeti */}
                  <div className="p-4 bg-ink-50/50 grid grid-cols-2 gap-y-3 gap-x-4">
                    <div>
                      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-1">
                        {t.bakiye_has > 0 ? 'BORCUNUZ (HAS)' : t.bakiye_has < 0 ? 'ALACAĞINIZ (HAS)' : 'HAS BAKİYE'}
                      </p>
                      <p className={`font-mono font-black text-base ${t.bakiye_has > 0 ? 'text-red-600' : t.bakiye_has < 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
                        {Math.abs(t.bakiye_has).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} gr
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-1">
                        {t.bakiye_tl > 0 ? 'BORCUNUZ (TL)' : t.bakiye_tl < 0 ? 'ALACAĞINIZ (TL)' : 'TL BAKİYE'}
                      </p>
                      <p className={`font-mono font-black text-base ${t.bakiye_tl > 0 ? 'text-red-600' : t.bakiye_tl < 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
                        {Math.abs(t.bakiye_tl).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </p>
                    </div>
                    
                    {/* Sadece bakiyesi olan dövizleri göster veya yer varsa ikisini de göster */}
                    {(t.bakiye_usd !== 0 || t.bakiye_eur !== 0) && (
                      <>
                        {t.bakiye_usd !== 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-1">
                              {t.bakiye_usd > 0 ? 'BORCUNUZ (USD)' : t.bakiye_usd < 0 ? 'ALACAĞINIZ (USD)' : 'USD BAKİYE'}
                            </p>
                            <p className={`font-mono font-black text-base ${t.bakiye_usd > 0 ? 'text-red-600' : t.bakiye_usd < 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
                              {Math.abs(t.bakiye_usd).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $
                            </p>
                          </div>
                        )}
                        {t.bakiye_eur !== 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-1">
                              {t.bakiye_eur > 0 ? 'BORCUNUZ (EUR)' : t.bakiye_eur < 0 ? 'ALACAĞINIZ (EUR)' : 'EUR BAKİYE'}
                            </p>
                            <p className={`font-mono font-black text-base ${t.bakiye_eur > 0 ? 'text-red-600' : t.bakiye_eur < 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
                              {Math.abs(t.bakiye_eur).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Aksiyon */}
                <div className="flex border-t border-ink-100">
                  <Link
                    to={`/toptancilar/${t.id}`}
                    className="flex-1 p-3 text-center bg-ink-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-gold-500 transition-colors flex justify-center items-center gap-2"
                  >
                    İşlemler <ArrowRight size={14} />
                  </Link>
                  <button
                    onClick={() => handleSilmeBaslat(t)}
                    className="p-3 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center border-l border-ink-100"
                    title="Toptancıyı Sil"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* YENİ EKLE MODALI */}
      {modalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md border premium-border premium-shadow p-6">
            <h2 className="text-xl font-black text-ink-900 mb-6">Yeni Toptancı Ekle</h2>
            <form onSubmit={handleEkle} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                  Unvan / Firma Adı *
                  <InfoTooltip text="Toptancının fatura kesiminde veya cari takibinde kullanılacak resmi ticari ünvanı veya firma adı." />
                </label>
                <input
                  type="text" required autoFocus
                  className="w-full bg-ink-50 border premium-border p-3 text-sm font-semibold text-ink-900 outline-none focus:border-gold-500"
                  value={yeniToptanci.unvan} onChange={e => setYeniToptanci({...yeniToptanci, unvan: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                  Telefon
                  <InfoTooltip text="Toptancı firmaya veya temsilcisine ait aktif irtibat numarası." />
                </label>
                <input
                  type="text"
                  className="w-full bg-ink-50 border premium-border p-3 text-sm font-semibold text-ink-900 outline-none focus:border-gold-500"
                  value={yeniToptanci.telefon} onChange={e => setYeniToptanci({...yeniToptanci, telefon: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                  Açıklama / Not
                  <InfoTooltip text="Toptancıyla ilgili hatırlatıcı özel notlar, adres veya banka iban bilgileri." />
                </label>
                <textarea
                  className="w-full bg-ink-50 border premium-border p-3 text-sm font-semibold text-ink-900 outline-none focus:border-gold-500 resize-none h-20"
                  value={yeniToptanci.aciklama} onChange={e => setYeniToptanci({...yeniToptanci, aciklama: e.target.value})}
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-ink-100">
                <button
                  type="button" onClick={() => setModalAcik(false)}
                  className="flex-1 bg-ink-100 text-ink-700 py-3 font-bold hover:bg-ink-200 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gold-500 text-white py-3 font-bold hover:bg-gold-600 transition-colors shadow-lg shadow-gold-500/20"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GÜVENLİ TOPTANCI SİLME MODALI */}
      {silOnayAdim > 0 && silSeciliToptanci && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md border border-red-100 premium-shadow p-6 relative">
            <button
              onClick={() => { setSilOnayAdim(0); setSilSeciliToptanci(null); }}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-50 flex items-center justify-center transition-all"
            >
              <X size={18} />
            </button>

            {silOnayAdim === 1 && (
              <div>
                <h3 className="text-lg font-black text-red-600 mb-2 flex items-center gap-2">
                  <AlertTriangle className="text-red-500 animate-pulse" />
                  Kalıcı Silme Güvenlik Doğrulaması
                </h3>
                <p className="text-xs text-ink-500 mb-4 leading-relaxed">
                  <strong>{silSeciliToptanci.unvan}</strong> firmasını silmek istediğinizden emin misiniz? 
                  Bu işlem firmaya ait <strong>tüm cari hesapları, işlemleri ve bakiyeleri</strong> kalıcı olarak silecektir. 
                  Bu işlem geri alınamaz!
                </p>
                <form onSubmit={handleSilmeOnaylaAdim1} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                      Onaylamak için firma adını tam olarak yazın:
                    </label>
                    <input
                      type="text" required autoFocus
                      placeholder={silSeciliToptanci.unvan}
                      className="w-full bg-red-50/20 border border-red-100 p-3 text-sm font-bold text-ink-900 outline-none focus:border-red-500"
                      value={silGirisUnvan}
                      onChange={e => setSilGirisUnvan(e.target.value)}
                    />
                  </div>
                  {silHata && (
                    <p className="text-xs text-red-600 font-bold">{silHata}</p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => { setSilOnayAdim(0); setSilSeciliToptanci(null); }}
                      className="flex-1 bg-ink-100 text-ink-700 py-3 font-bold hover:bg-ink-200 transition-all text-xs"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={silGirisUnvan.trim() !== silSeciliToptanci.unvan.trim()}
                      className={`flex-1 py-3 font-bold transition-all text-xs text-white ${
                        silGirisUnvan.trim() === silSeciliToptanci.unvan.trim()
                          ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20'
                          : 'bg-ink-200 cursor-not-allowed text-ink-400'
                      }`}
                    >
                      Devam Et
                    </button>
                  </div>
                </form>
              </div>
            )}

            {silOnayAdim === 2 && (
              <div className="text-center">
                <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-lg font-black text-ink-900 mb-2">Son Kararınız Mı?</h3>
                <p className="text-xs text-ink-500 mb-6 leading-relaxed">
                  <strong>{silSeciliToptanci.unvan}</strong> firmasına ait tüm geçmiş datalar silinmek üzere. 
                  Bu işlemi onaylıyor musunuz?
                </p>
                {silHata && (
                  <p className="text-xs text-red-600 font-bold mb-4">{silHata}</p>
                )}
                <div className="flex gap-3">
                  <button
                    disabled={silLoading}
                    onClick={() => { setSilOnayAdim(0); setSilSeciliToptanci(null); }}
                    className="flex-1 bg-ink-100 text-ink-700 py-3 font-bold hover:bg-ink-200 transition-all text-xs"
                  >
                    Hayır, Vazgeç
                  </button>
                  <button
                    disabled={silLoading}
                    onClick={handleSilmeTamamla}
                    className="flex-1 bg-red-600 text-white py-3 font-bold hover:bg-red-700 transition-all text-xs shadow-lg shadow-red-600/20 flex items-center justify-center gap-1.5"
                  >
                    {silLoading ? 'Siliniyor...' : 'Evet, Kesinlikle Sil'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
