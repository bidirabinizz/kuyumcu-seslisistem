import { Mic, AlertCircle } from 'lucide-react';

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

export const IslemTable = ({ islemler }) => (
  <div className="bg-[#f8fafc] rounded-3xl border border-[#d4af37]/20 shadow-[0_10px_25px_rgba(0,0,0,0.05)]">
    <div className="px-6 py-5 border-b border-ink-100 flex items-center justify-between">
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
      <table className="w-full text-left min-w-[580px] bg-[#f8fafc] rounded-lg border border-[#d4af37]/30">
        <thead>
          <tr className="border-b border-[#d4af37]/20">
            <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">İşlem</th>
            <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">Ayar</th>
            <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">Brüt Miktar</th>
            <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">Has Altın</th>
            <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">Saat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d4af37]/5">
          {islemler.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-16 text-center">
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
              key={idx}
              className="group hover:bg-[#f8fafc]/30 transition-all duration-200 group-hover:shadow-gold-20/30 group-hover:scale-105"
              style={{ animationDelay: `${idx * 30}ms` }}
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
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);
