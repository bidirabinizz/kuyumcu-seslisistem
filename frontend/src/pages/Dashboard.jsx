import { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Coins } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import { KasaCard }   from '../components/KasaCard';
import { IslemTable } from '../components/IslemTable';
import { FilterBar }  from '../components/FilterBar';
import { StatCard }   from '../components/StatCard';

export const Dashboard = () => {
  const { islemler, toplamHas, connected } = useSocket('ws://localhost:8000/ws');
  const [filters, setFilters] = useState({});

  const gunlukAlis  = islemler.filter(i => i.tip === 'ALIS').reduce((s, i) => s + i.has, 0);
  const gunlukSatis = islemler.filter(i => i.tip === 'SATIS').reduce((s, i) => s + i.has, 0);

  const filtrelenmis = islemler.filter(i => {
    if (filters.tip && i.tip !== filters.tip) return false;
    return true;
  });

  const exportPDF = () => window.open('http://localhost:8000/rapor/pdf', '_blank');

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
      {/* Header */}
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Toplam Has"     value={toplamHas.toFixed(2)}    unit="gr"  icon={Coins}        color="gold"    />
        <StatCard label="Günlük Alış"    value={gunlukAlis.toFixed(2)}   unit="gr"  icon={TrendingUp}   color="emerald" />
        <StatCard label="Günlük Satış"   value={gunlukSatis.toFixed(2)}  unit="gr"  icon={TrendingDown} color="red"     />
        <StatCard label="İşlem Sayısı"   value={islemler.length}         unit="adet" icon={Activity}    color="ink"     />
      </div>

      {/* Kasa + Tablo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1">
          <KasaCard miktar={toplamHas} gunlukAlis={gunlukAlis} gunlukSatis={gunlukSatis} />
        </div>
        <div className="lg:col-span-2">
          <FilterBar onExport={exportPDF} filters={filters} onChange={setFilters} />
          <IslemTable islemler={filtrelenmis} />
        </div>
      </div>
    </div>
  );
};
