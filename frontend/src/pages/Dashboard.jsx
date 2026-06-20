import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { TrendingUp, TrendingDown, Activity, Coins, RotateCcw, CreditCard, Banknote, Calendar } from 'lucide-react';
import { useSocket }       from '../hooks/useSocket';
import { useMarket }       from '../hooks/useMarket';
import { KasaCard }        from '../components/KasaCard';
import { IslemTable }      from '../components/IslemTable';
import { FilterBar }       from '../components/FilterBar';
import { StatCard }        from '../components/StatCard';
import { ManualIslemForm } from '../components/ManualIslemForm';
import { API_BASE, WS_BASE } from '../apiConfig';
import axios from 'axios';

export const Dashboard = () => {
  const location = useLocation();
  const bugunTarihObjesi = new Date();
  const todayStr = new Date(bugunTarihObjesi.getTime() - bugunTarihObjesi.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];

  const [activePeriod, setActivePeriod] = useState('today'); // 'today' | 'week' | 'total' | 'custom'
  const [customRange, setCustomRange] = useState({ start: todayStr, end: todayStr });

  const dateFilter = useMemo(() => {
    if (activePeriod === 'today') {
      return { type: 'today', start: todayStr, end: todayStr };
    }
    if (activePeriod === 'week') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      const startStr = new Date(start.getTime() - start.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];
      return { type: 'week', start: startStr, end: todayStr };
    }
    if (activePeriod === 'custom') {
      return { type: 'custom', start: customRange.start, end: customRange.end };
    }
    return { type: 'total' };
  }, [activePeriod, customRange, todayStr]);

  const {
    islemler,
    toplamHas,
    toplamTl,
    toplamUsd,
    toplamEur,
    connected,
    loading,
    lastTx,
    setLastTx
  } = useSocket(WS_BASE, dateFilter);

  const { kurlar, yenile: yenileKurlar } = useMarket();

  const [filters, setFilters] = useState({ personel_id: '', tip: '', tarih: todayStr });

  // Geri uyumluluk ve periyot değişimi
  const handlePeriodChange = (period) => {
    setActivePeriod(period);
    if (period === 'today') {
      setFilters(prev => ({ ...prev, tarih: todayStr }));
    } else {
      setFilters(prev => ({ ...prev, tarih: '' }));
    }
  };

  // Günlük Kur Ayarlama Modalı State'leri
  const [kurModalAcik, setKurModalAcik] = useState(false);
  const [kurForm, setKurForm] = useState({ usd_try: '', eur_try: '', gram_altin_24k_try: '' });
  const [kurGuncellemeLoading, setKurGuncellemeLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('openKurModal') === 'true') {
      setKurModalAcik(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location.search]);

  useEffect(() => {
    if (kurlar) {
      setKurForm({
        usd_try: kurlar.usd_try || '',
        eur_try: kurlar.eur_try || '',
        gram_altin_24k_try: kurlar.gram_altin_24k_try || ''
      });
    }
  }, [kurlar, kurModalAcik]);

  const handleKurKaydet = async (e) => {
    e.preventDefault();
    setKurGuncellemeLoading(true);
    try {
      await axios.put(`${API_BASE}/piyasa/kurlar`, {
        usd_try: parseFloat(kurForm.usd_try) || 0,
        eur_try: parseFloat(kurForm.eur_try) || 0,
        gram_altin_24k_try: parseFloat(kurForm.gram_altin_24k_try) || 0
      });
      await yenileKurlar();
      setKurModalAcik(false);
    } catch (err) {
      alert("Kurlar güncellenirken bir hata oluştu.");
    } finally {
      setKurGuncellemeLoading(false);
    }
  };

  // ── Dönemsel işlem filtreleri ──────────────────────────────────────────────
  const donemIslemleri = islemler;

  const gunlukAlis  = donemIslemleri.filter(i => i.tip === 'ALIS' ).reduce((s, i) => s + i.has, 0);
  const gunlukSatis = donemIslemleri.filter(i => i.tip === 'SATIS').reduce((s, i) => s + i.has, 0);

  // Dönem nakit / kart adet sayısı
  const nakitAdet = donemIslemleri.filter(i => i.odeme_tipi === 'NAKIT').length;
  const kartAdet  = donemIslemleri.filter(i => i.odeme_tipi === 'KART' ).length;

  // Piyasa P/L hesabı
  const piyasaFiyat = Number(kurlar?.gram_altin_24k_try || 0);
  const piyasaPL = donemIslemleri.reduce((acc, i) => {
    const has   = Number(i.has || 0);
    const birim = Number(i.birim_fiyat || 0);
    if (!has || !birim || !piyasaFiyat) return acc;
    const market  = has * piyasaFiyat;
    const nominal = birim;
    return i.tip === 'ALIS' ? acc + (market - nominal) : acc + (nominal - market);
  }, 0);

  // ── Filtreleme ─────────────────────────────────────────────────────────────
  const filteredIslemler = islemler.filter(islem => {
    const personelMatch = !filters.personel_id || String(islem.personel_id) === String(filters.personel_id);
    const tipMatch      = !filters.tip         || islem.tip === filters.tip;
    const tarihMatch    = !filters.tarih       || islem.islem_tarihi?.split('T')[0] === filters.tarih;
    return personelMatch && tipMatch && tarihMatch;
  });

  // ── lastTx auto-temizle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastTx) return;
    const t = setTimeout(() => setLastTx(null), 10_000);
    return () => clearTimeout(t);
  }, [lastTx, setLastTx]);

  // ── Actionlar ─────────────────────────────────────────────────────────────
  const handleEdit = async (id, updatedData) => {
    try {
      await axios.put(`${API_BASE}/islemler/${id}`, { ...updatedData, personel_id: 1 });
    } catch {
      alert('İşlem güncellenirken hata oluştu.');
    }
  };

  const handleUndo = async (id) => {
    try {
      await axios.delete(`${API_BASE}/islemler/${id}`);
    } catch {
      alert('İşlem silinirken hata oluştu.');
    }
  };

  const exportPDF = () => window.open(`${API_BASE}/rapor/pdf`, '_blank');

  const getPeriodLabel = (p) => {
    if (p === 'today') return 'Günlük';
    if (p === 'week') return 'Haftalık';
    if (p === 'custom') return 'Dönemsel';
    return 'Genel';
  };

  const isTotal = activePeriod === 'total';

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
      {/* ── Yeni İşlem Toast ─── */}
      {lastTx && (
        <div className="fixed bottom-8 left-8 z-50 bg-ink-900 border border-ink-800 text-white pl-5 pr-3 py-3 rounded-none shadow-2xl flex items-center gap-6 animate-fadeUp">
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wide">İşlem Kasa'ya İşlendi</span>
            <span className="text-xs text-ink-300 font-medium mt-0.5">
              {lastTx.miktar} {lastTx.birim === 'ADET' ? 'Adet' : 'gr'} ·{' '}
              {String(lastTx.ayar).replace('_AYAR', ' Ayar').replace('_ALTIN', ' Altın')} ·{' '}
              {lastTx.tip}
              {lastTx.odeme_tipi === 'KART' && (
                <span className="ml-1.5 text-blue-400 font-bold">· 💳 KART</span>
              )}
            </span>
            {lastTx.uyari && (
              <span className="text-xs text-amber-400 mt-0.5">⚠ {lastTx.uyari}</span>
            )}
          </div>
          <button
            onClick={() => handleUndo(lastTx.id)}
            className="flex items-center gap-1.5 bg-ink-800 hover:bg-ink-700 px-4 py-2.5 rounded-none text-xs font-black text-gold-400 transition-all active:scale-95"
          >
            <RotateCcw size={14} /> Geri Al
          </button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-ink-900 tracking-tight">Kasa Takip</h1>
          <p className="text-sm text-ink-400 mt-0.5">İşlemler anlık olarak yansıtılır</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setKurModalAcik(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-ink-200 text-xs font-bold text-ink-700 hover:bg-ink-50 transition-all rounded-none shadow-sm"
          >
            <Activity size={12} className="text-gold-500" /> Günlük Kurları Ayarla
          </button>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-none text-xs font-bold border premium-border ${
            connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-600 border-red-200'
          }`}>
            <span className={`w-2 h-2 rounded-none ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {connected ? 'Sistem Aktif' : 'Bağlantı Kesildi'}
          </div>
        </div>
      </div>

      {/* ── Takip Aralığı (Period Selectors) ─────────────────────────────────── */}
      <div className="bg-white border premium-border p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 premium-shadow">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-ink-500 mr-2">Takip Aralığı:</span>
          {[
            { key: 'today', label: 'Bugün' },
            { key: 'week', label: 'Bu Hafta' },
            { key: 'total', label: 'Toplam Kasa' },
            { key: 'custom', label: 'Tarih Aralığı' }
          ].map(p => (
            <button
              key={p.key}
              onClick={() => handlePeriodChange(p.key)}
              className={`px-4 py-2 text-xs font-bold transition-all border ${
                activePeriod === p.key
                  ? 'bg-ink-900 border-ink-900 text-white'
                  : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {activePeriod === 'custom' && (
          <div className="flex items-center gap-2 text-xs animate-fadeIn">
            <Calendar size={14} className="text-gold-600" />
            <input
              type="date"
              className="bg-ink-50 border border-ink-250 px-2 py-1.5 text-xs font-bold text-ink-900 outline-none focus:border-gold-500"
              value={customRange.start}
              onChange={e => setCustomRange({ ...customRange, start: e.target.value })}
            />
            <span className="text-ink-400 font-bold">—</span>
            <input
              type="date"
              className="bg-ink-50 border border-ink-250 px-2 py-1.5 text-xs font-bold text-ink-900 outline-none focus:border-gold-500"
              value={customRange.end}
              onChange={e => setCustomRange({ ...customRange, end: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* ── Stat Kartları ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label={`${isTotal ? 'Toplam' : 'Net'} Has`} value={toplamHas.toFixed(2)} unit="gr" icon={Coins} color="gold" />
        <StatCard label={`${getPeriodLabel(activePeriod)} Alış`} value={gunlukAlis.toFixed(2)} unit="gr" icon={TrendingUp} color="emerald" />
        <StatCard label={`${getPeriodLabel(activePeriod)} Satış`} value={gunlukSatis.toFixed(2)} unit="gr" icon={TrendingDown} color="red" />
        <StatCard label={`${getPeriodLabel(activePeriod)} P/L`} value={piyasaPL.toFixed(2)} unit="TL" icon={Activity} color="ink" />
      </div>

      {/* ── Nakit / Kart Özet Şeridi ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="flex items-center gap-3 bg-white border premium-border rounded-none px-4 py-3">
          <Banknote size={16} className="text-emerald-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">{getPeriodLabel(activePeriod)} Nakit İşlem</p>
            <p className="text-lg font-black text-ink-900 font-display">{nakitAdet} <span className="text-xs font-normal text-ink-400">adet</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white border premium-border rounded-none px-4 py-3">
          <CreditCard size={16} className="text-blue-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">{getPeriodLabel(activePeriod)} Kartlı İşlem</p>
            <p className="text-lg font-black text-ink-900 font-display">{kartAdet} <span className="text-xs font-normal text-ink-400">adet</span></p>
          </div>
        </div>
      </div>

      {/* ── Ana İçerik ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1 space-y-6">
          <KasaCard
            miktar={toplamHas}
            toplamTl={toplamTl}
            toplamUsd={toplamUsd}
            toplamEur={toplamEur}
            gunlukAlis={gunlukAlis}
            gunlukSatis={gunlukSatis}
            period={activePeriod}
          />
          <ManualIslemForm />
        </div>

        <div className="lg:col-span-2">
          <FilterBar onExport={exportPDF} filters={filters} onChange={setFilters} />
          <IslemTable
            islemler={filteredIslemler}
            onUndo={handleUndo}
            onEdit={handleEdit}
            loading={loading}
          />
        </div>
      </div>

      {/* ── KURLAR MODALI ──────────────────────────────────────────────────── */}
      {kurModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md border border-ink-200 shadow-2xl rounded-none overflow-hidden animate-fadeIn relative">
            <div className="h-1.5 w-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-700"></div>
            
            <div className="p-6 border-b border-ink-150 bg-white flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-ink-900">Günlük Kurları Ayarla</h2>
                <p className="text-xs text-ink-400 mt-0.5">Sistemde kullanılacak serbest piyasa fiyatları.</p>
              </div>
              <button 
                onClick={() => setKurModalAcik(false)}
                className="p-1.5 hover:bg-ink-100 text-ink-400 hover:text-ink-900 transition-colors rounded-none"
              >
                <RotateCcw size={16} />
              </button>
            </div>

            <form onSubmit={handleKurKaydet} className="p-6 space-y-4">
              {/* Dolar Kuru */}
              <div>
                <label className="block text-xs font-bold text-ink-600 uppercase mb-1">Dolar Kuru ($ / TL)</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  className="w-full bg-ink-50 border border-ink-200 rounded-none px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none font-mono font-bold"
                  value={kurForm.usd_try}
                  onChange={e => setKurForm({ ...kurForm, usd_try: e.target.value })}
                />
              </div>

              {/* Euro Kuru */}
              <div>
                <label className="block text-xs font-bold text-ink-600 uppercase mb-1">Euro Kuru (€ / TL)</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  className="w-full bg-ink-50 border border-ink-200 rounded-none px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none font-mono font-bold"
                  value={kurForm.eur_try}
                  onChange={e => setKurForm({ ...kurForm, eur_try: e.target.value })}
                />
              </div>

              {/* 24K Altın Gram Fiyatı */}
              <div>
                <label className="block text-xs font-bold text-ink-600 uppercase mb-1">24K Has Altın Gram (TL / gr)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="w-full bg-ink-50 border border-ink-200 rounded-none px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none font-mono font-bold"
                  value={kurForm.gram_altin_24k_try}
                  onChange={e => setKurForm({ ...kurForm, gram_altin_24k_try: e.target.value })}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/piyasa/kurlar`);
                      const data = await res.json();
                      if (res.ok) {
                        setKurForm({
                          usd_try: data.usd_try || '',
                          eur_try: data.eur_try || '',
                          gram_altin_24k_try: data.gram_altin_24k_try || ''
                        });
                      }
                    } catch (_) {
                      alert("Canlı kurlar alınamadı.");
                    }
                  }}
                  className="flex-1 py-2.5 rounded-none border border-ink-200 text-xs font-bold text-ink-600 hover:bg-ink-50 transition-colors"
                >
                  TCMB Kurlarını Getir
                </button>
                <button
                  type="submit"
                  disabled={kurGuncellemeLoading}
                  className="flex-1 py-2.5 rounded-none bg-gold-600 hover:bg-gold-700 text-white font-bold text-xs shadow-md transition-colors"
                >
                  {kurGuncellemeLoading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
