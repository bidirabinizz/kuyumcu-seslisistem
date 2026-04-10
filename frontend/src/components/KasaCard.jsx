import { TrendingUp, TrendingDown, Coins } from 'lucide-react';

export const KasaCard = ({ miktar, gunlukAlis = 0, gunlukSatis = 0 }) => (
  <div className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-900 shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
    {/* Texture overlay */}
    <div className="absolute inset-0 opacity-[0.03]"
      style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '8px 8px' }}
    />

    <div className="relative z-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Coins size={18} className="text-gold-300" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-gold-300/70 uppercase">Toplam Has Stok</p>
            <p className="text-[10px] text-white/40 font-mono">Anlık · Canlı</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/10 text-gold-300 border border-gold-500/20 backdrop-blur-sm">
          CANLI
        </span>
      </div>

      {/* Main number */}
      <div className="mb-8">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-black text-white tracking-tight leading-none">
            {miktar.toFixed(3)}
          </span>
          <span className="text-lg font-medium text-white/50 mb-1">GR</span>
        </div>
        <p className="text-sm text-white/40 mt-1.5 font-mono">
          ≈ {(miktar / 31.1035).toFixed(4)} troy oz
        </p>
      </div>

      {/* Günlük özet */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/15 border border-emerald-500/20 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-emerald-400" />
            <p className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider">Günlük Alış</p>
          </div>
          <p className="text-lg font-black text-emerald-300 font-display">{gunlukAlis.toFixed(3)}</p>
          <p className="text-[10px] text-emerald-400/50">gram has</p>
        </div>
        <div className="bg-red-500/15 border border-red-500/20 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={12} className="text-red-400" />
            <p className="text-[10px] font-bold text-red-400/80 uppercase tracking-wider">Günlük Satış</p>
          </div>
          <p className="text-lg font-black text-red-300 font-display">{gunlukSatis.toFixed(3)}</p>
          <p className="text-[10px] text-red-400/50">gram has</p>
        </div>
      </div>
    </div>
  </div>
);
