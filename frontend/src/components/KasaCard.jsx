import { TrendingUp, TrendingDown, Coins } from 'lucide-react';

export const KasaCard = ({
  miktar = 0,
  toplamTl = 0,
  toplamUsd = 0,
  toplamEur = 0,
  gunlukAlis = 0,
  gunlukSatis = 0,
  period = 'today'
}) => {
  const isTotal = period === 'total';
  const labelPrefix = isTotal ? 'Toplam' : 'Dönem';
  const subLabel = isTotal ? 'Anlık · Genel Kasa' : 'Anlık · Seçili Dönem';

  return (
    <div className="relative overflow-hidden rounded-none p-6 bg-white border premium-border border-l-4 border-l-[var(--gold)] premium-shadow">
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-none bg-ink-50 flex items-center justify-center border premium-border">
              <Coins size={18} className="text-gold-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-ink-500 uppercase">
                {isTotal ? 'Toplam Has Stok' : 'Dönem Has Değişimi'}
              </p>
              <p className="text-[10px] text-ink-400 font-mono">{subLabel}</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-none bg-gold-50 text-gold-700 border border-gold-200">
            CANLI
          </span>
        </div>

        {/* Main Gold Number */}
        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-black text-ink-900 tracking-tight leading-none">
              {(miktar || 0).toFixed(3)}
            </span>
            <span className="text-lg font-medium text-ink-400 mb-1">GR</span>
          </div>
          <p className="text-sm text-ink-400 mt-1.5 font-mono">
            ≈ {((miktar || 0) / 31.1035).toFixed(4)} troy oz
          </p>
        </div>

        {/* Alış / Satış Bölümü */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-emerald-50 border border-emerald-100 rounded-none p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={12} className="text-emerald-600" />
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                {isTotal ? 'Toplam Alış' : `${period === 'today' ? 'Günlük' : period === 'week' ? 'Haftalık' : 'Dönemsel'} Alış`}
              </p>
            </div>
            <p className="text-lg font-black text-emerald-800 font-display">{(gunlukAlis || 0).toFixed(3)}</p>
            <p className="text-[10px] text-emerald-600/70">gram has</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-none p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown size={12} className="text-red-600" />
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
                {isTotal ? 'Toplam Satış' : `${period === 'today' ? 'Günlük' : period === 'week' ? 'Haftalık' : 'Dönemsel'} Satış`}
              </p>
            </div>
            <p className="text-lg font-black text-red-800 font-display">{(gunlukSatis || 0).toFixed(3)}</p>
            <p className="text-[10px] text-red-600/70">gram has</p>
          </div>
        </div>

        {/* Nakit / Döviz Kasaları */}
        <div className="border-t border-ink-100 pt-5 space-y-3">
          <p className="text-[10px] font-bold tracking-wider text-ink-400 uppercase mb-2">Para Kasaları ({labelPrefix})</p>
          
          {/* TL Kasa */}
          <div className="flex justify-between items-center bg-ink-50/50 p-2.5 border border-ink-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-700">₺ TL Kasası</span>
            </div>
            <span className={`font-mono text-sm font-black ${toplamTl < 0 ? 'text-red-600' : toplamTl > 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
              {toplamTl.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </span>
          </div>

          {/* USD Kasa */}
          <div className="flex justify-between items-center bg-ink-50/50 p-2.5 border border-ink-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-700">$ USD Kasası</span>
            </div>
            <span className={`font-mono text-sm font-black ${toplamUsd < 0 ? 'text-red-600' : toplamUsd > 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
              {toplamUsd.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $
            </span>
          </div>

          {/* EUR Kasa */}
          <div className="flex justify-between items-center bg-ink-50/50 p-2.5 border border-ink-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-700">€ EUR Kasası</span>
            </div>
            <span className={`font-mono text-sm font-black ${toplamEur < 0 ? 'text-red-600' : toplamEur > 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
              {toplamEur.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
