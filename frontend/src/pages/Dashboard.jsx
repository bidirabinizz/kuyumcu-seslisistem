import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Coins, RotateCcw, CreditCard, Banknote } from 'lucide-react';
import { useSocket }       from '../hooks/useSocket';
import { useMarket }       from '../hooks/useMarket';
import { KasaCard }        from '../components/KasaCard';
import { IslemTable }      from '../components/IslemTable';
import { FilterBar }       from '../components/FilterBar';
import { StatCard }        from '../components/StatCard';
import { VoiceAssistantUI } from '../components/VoiceAssistantUI';
import { ManualIslemForm } from '../components/ManualIslemForm';
import { API_BASE, WS_BASE } from '../apiConfig';
import axios from 'axios';

export const Dashboard = () => {
  const { islemler, toplamHas, connected, loading, voiceState, lastTx, setLastTx } = useSocket(WS_BASE);
  const { kurlar } = useMarket();

  const bugunTarihObjesi = new Date();
  const todayStr = new Date(bugunTarihObjesi.getTime() - bugunTarihObjesi.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];

  const [filters, setFilters] = useState({ personel_id: '', tip: '', tarih: todayStr });

  // ── Günlük işlem filtreleri ────────────────────────────────────────────────
  const bugunkuIslemler = islemler.filter(i =>
    i.islem_tarihi?.split('T')[0] === todayStr
  );

  const gunlukAlis  = bugunkuIslemler.filter(i => i.tip === 'ALIS' ).reduce((s, i) => s + i.has, 0);
  const gunlukSatis = bugunkuIslemler.filter(i => i.tip === 'SATIS').reduce((s, i) => s + i.has, 0);

  // Bugünkü nakit / kart adet sayısı
  const nakitAdet = bugunkuIslemler.filter(i => i.odeme_tipi === 'NAKIT').length;
  const kartAdet  = bugunkuIslemler.filter(i => i.odeme_tipi === 'KART' ).length;

  // Piyasa P/L hesabı
  const piyasaFiyat = Number(kurlar?.gram_altin_24k_try || 0);
  const piyasaPL = islemler.reduce((acc, i) => {
    const has   = Number(i.has || 0);
    const brut  = Number(i.miktar || 0);
    const birim = Number(i.birim_fiyat || 0);
    if (!has || !brut || !birim || !piyasaFiyat) return acc;
    const market  = has * piyasaFiyat;
    const nominal = brut * birim;
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

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
      <VoiceAssistantUI voiceState={voiceState} />

      {/* ── Yeni İşlem Toast (Bug fix: onClick={() => handleUndo(lastTx.id)) ─── */}
      {lastTx && (
        <div className="fixed bottom-8 left-8 z-50 bg-ink-900 border border-ink-800 text-white pl-5 pr-3 py-3 rounded-2xl shadow-2xl flex items-center gap-6 animate-fadeUp">
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wide">İşlem Kasa'ya İşlendi</span>
            <span className="text-xs text-ink-300 font-medium mt-0.5">
              {lastTx.miktar} {lastTx.birim === 'ADET' ? 'Adet' : 'gr'} ·{' '}
              {String(lastTx.ayar).replace('_AYAR', ' Ayar').replace('_ALTIN', ' Altın')} ·{' '}
              {lastTx.tip}
              {lastTx.odeme_tipi === 'KART' && (
                <span className="ml-1.5 text-blue-400">· 💳 KART</span>
              )}
            </span>
            {lastTx.uyari && (
              <span className="text-xs text-amber-400 mt-0.5">⚠ {lastTx.uyari}</span>
            )}
          </div>
          {/* Bug fix: id parameterini doğru geçir */}
          <button
            onClick={() => handleUndo(lastTx.id)}
            className="flex items-center gap-1.5 bg-ink-800 hover:bg-ink-700 px-4 py-2.5 rounded-xl text-xs font-black text-gold-400 transition-all active:scale-95"
          >
            <RotateCcw size={14} /> Geri Al
          </button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-ink-900 tracking-tight">Kasa Takip</h1>
          <p className="text-sm text-ink-400 mt-0.5">Sesli komutlarla anlık güncellenir</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border ${
          connected
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-red-50 text-red-600 border-red-200'
        }`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          {connected ? 'Sistem Aktif' : 'Bağlantı Kesildi'}
        </div>
      </div>

      {/* ── Stat Kartları ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Toplam Has"   value={toplamHas.toFixed(2)}   unit="gr"  icon={Coins}        color="gold"    />
        <StatCard label="Günlük Alış"  value={gunlukAlis.toFixed(2)}  unit="gr"  icon={TrendingUp}   color="emerald" />
        <StatCard label="Günlük Satış" value={gunlukSatis.toFixed(2)} unit="gr"  icon={TrendingDown} color="red"     />
        <StatCard label="Piyasa P/L"   value={piyasaPL.toFixed(2)}    unit="TL"  icon={Activity}     color="ink"     />
      </div>

      {/* ── Nakit / Kart Özet Şeridi ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <Banknote size={16} className="text-emerald-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Nakit İşlem</p>
            <p className="text-lg font-black text-emerald-800 font-display">{nakitAdet} <span className="text-xs font-normal text-emerald-500">adet</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <CreditCard size={16} className="text-blue-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Kartlı İşlem</p>
            <p className="text-lg font-black text-blue-800 font-display">{kartAdet} <span className="text-xs font-normal text-blue-500">adet</span></p>
          </div>
        </div>
      </div>

      {/* ── Ana İçerik ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1 space-y-6">
          <KasaCard miktar={toplamHas} gunlukAlis={gunlukAlis} gunlukSatis={gunlukSatis} />
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
    </div>
  );
};
