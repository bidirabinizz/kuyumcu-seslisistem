import { Mic, RotateCcw, Trash2 } from 'lucide-react';

const AYAR_LABEL = {
  '24_AYAR': '24 Ayar',
  '22_AYAR': '22 Ayar',
  '18_AYAR': '18 Ayar',
  '14_AYAR': '14 Ayar',
};

const AYAR_COLOR = {
  '24_AYAR': 'text-gold-600 bg-gold-100',
  '22_AYAR': 'text-amber-700 bg-amber-100',
  '18_AYAR': 'text-orange-700 bg-orange-100',
  '14_AYAR': 'text-ink-600 bg-ink-100',
};

// onUndo prop'unu ekledik
export const IslemTable = ({ islemler, onUndo }) => (
  <div className="bg-[#f8fafc] rounded-3xl border border-[#d4af37]/20 shadow-[0_10px_25px_rgba(0,0,0,0.05)] mt-4 overflow-hidden">
    <div className="px-6 py-5 border-b border-ink-100 flex items-center justify-between bg-white">
      <div>
        <h2 className="text-base font-bold text-ink-800">Son Hareketler</h2>
        <p className="text-xs text-ink-400 mt-0.5">Sesli komutla oluşturulan işlemler</p>
      </div>
      <div className="flex items-center gap-2 text-xs font-medium text-ink-400 bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-100">
        <Mic size={12} />
        {islemler.length} işlem
      </div>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[650px]">
        <thead>
          <tr className="border-b border-[#d4af37]/10 bg-slate-50/50">
            <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">İşlem</th>
            <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Ayar</th>
            <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Brüt Miktar</th>
            <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Has Altın</th>
            <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Saat</th>
            <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right">Yönet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {islemler.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-ink-50 flex items-center justify-center">
                    <Mic size={20} className="text-ink-300" />
                  </div>
                  <p className="text-sm text-ink-400 font-medium">Sesli komut bekleniyor…</p>
                  <p className="text-xs text-ink-300">İşlem geldiğinde burada görünecek</p>
                </div>
              </td>
            </tr>
          ) : (
            islemler.map((islem, idx) => (
              <tr
                key={islem.id || idx}
                // Animate-fadeIn class'ı ile yeni gelen işlemler yumuşakça belirir
                className="group hover:bg-slate-50/80 transition-all duration-300 animate-fadeIn"
              >
                <td className="px-6 py-4">
                  <span className={`
                    inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wider uppercase
                    ${islem.tip === 'SATIS'
                      ? 'bg-red-50 text-red-600 border border-red-100'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }
                  `}>
                    <span className={`w-1.5 h-1.5 rounded-full ${islem.tip === 'SATIS' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    {islem.tip === 'SATIS' ? 'Satış' : 'Alış'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${AYAR_COLOR[islem.ayar] || 'bg-ink-100 text-ink-600'}`}>
                    {AYAR_LABEL[islem.ayar] || islem.ayar}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="font-mono font-bold text-ink-800 text-sm">{islem.miktar}</span>
                  <span className="text-xs text-ink-400 ml-1">gr</span>
                </td>
                <td className="px-6 py-4">
                  <span className="font-mono font-black text-ink-900 text-sm">{Number(islem.has).toFixed(3)}</span>
                  <span className="text-xs text-ink-400 ml-1">gr has</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-mono text-ink-400">{islem.zaman || '—'}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onUndo && onUndo(islem.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title="İşlemi Geri Al / Sil"
                  >
                    <RotateCcw size={16} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);