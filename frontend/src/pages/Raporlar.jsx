import { useState, useMemo } from 'react';
import { Download, TrendingUp, TrendingDown, BarChart2, Calendar, Filter, ChevronDown } from 'lucide-react';

// ─── Demo veri üretici ───────────────────────────────────────────────────────
const AYARLAR = ['24_AYAR', '22_AYAR', '18_AYAR', '14_AYAR'];
const AYAR_LABEL = { '24_AYAR': '24 Ayar', '22_AYAR': '22 Ayar', '18_AYAR': '18 Ayar', '14_AYAR': '14 Ayar' };
const AYAR_MILYEM = { '24_AYAR': 1.0, '22_AYAR': 0.916, '18_AYAR': 0.75, '14_AYAR': 0.585 };
const PERSONELLER = ['Ahmet Çapar', 'Zeynep Yılmaz'];

function demoVeri() {
  const rows = [];
  const bugun = new Date();
  for (let d = 29; d >= 0; d--) {
    const tarih = new Date(bugun);
    tarih.setDate(bugun.getDate() - d);
    const tarihStr = tarih.toLocaleDateString('tr-TR');
    const islemSayisi = 2 + Math.floor(Math.random() * 6);
    for (let i = 0; i < islemSayisi; i++) {
      const ayar  = AYARLAR[Math.floor(Math.random() * AYARLAR.length)];
      const tip   = Math.random() > 0.45 ? 'ALIS' : 'SATIS';
      const brut  = +(2 + Math.random() * 28).toFixed(2);
      const has   = +(brut * AYAR_MILYEM[ayar]).toFixed(3);
      rows.push({
        tarih: tarihStr,
        tarihObj: new Date(tarih),
        tip,
        ayar,
        personel: PERSONELLER[Math.floor(Math.random() * PERSONELLER.length)],
        brut,
        has,
        saat: `${8 + Math.floor(Math.random()*10)}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`,
      });
    }
  }
  return rows.sort((a, b) => b.tarihObj - a.tarihObj);
}

const TUM_ISLEMLER = demoVeri();

// ─── Mini bar chart (saf SVG, kütüphane yok) ─────────────────────────────────
const MiniBarChart = ({ data, renk }) => {
  const max = Math.max(...data.map(d => d.deger), 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div
            className={`w-full rounded-sm transition-all ${renk}`}
            style={{ height: `${(d.deger / max) * 56}px`, minHeight: d.deger > 0 ? 2 : 0 }}
          />
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-ink-800 text-black text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap z-10">
            {d.label}: {d.deger.toFixed(2)} gr
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Donut chart (SVG) ────────────────────────────────────────────────────────
const DonutChart = ({ segments }) => {
  const total = segments.reduce((s, x) => s + x.deger, 0);
  const renkler = ['#F59E0B', '#D97706', '#92400E', '#3D3933'];
  let offset = 0;
  const r = 40, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEECEA" strokeWidth="12" />
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEECEA" strokeWidth="12" />
        ) : segments.map((seg, i) => {
          const pct = seg.deger / total;
          const dash = circ * pct;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={renkler[i]}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ}
              strokeLinecap="butt"
            />
          );
          offset += pct;
          return el;
        })}
      </svg>
      <div className="space-y-2 flex-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: renkler[i] }} />
              <span className="text-xs text-ink-600 font-medium">{AYAR_LABEL[seg.ayar]}</span>
            </div>
            <span className="text-xs font-bold font-mono text-ink-800">
              {total > 0 ? ((seg.deger / total) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Raporlar sayfası ─────────────────────────────────────────────────────────
export const Raporlar = () => {
  const [aralik, setAralik]   = useState('30');
  const [tip, setTip]         = useState('');
  const [personel, setPersonel] = useState('');

  const filtrelenmis = useMemo(() => {
    const sinir = new Date();
    sinir.setDate(sinir.getDate() - parseInt(aralik));
    return TUM_ISLEMLER.filter(r => {
      if (r.tarihObj < sinir) return false;
      if (tip && r.tip !== tip) return false;
      if (personel && r.personel !== personel) return false;
      return true;
    });
  }, [aralik, tip, personel]);

  // KPI hesapları
  const toplamAlis  = filtrelenmis.filter(r => r.tip === 'ALIS').reduce((s, r) => s + r.has, 0);
  const toplamSatis = filtrelenmis.filter(r => r.tip === 'SATIS').reduce((s, r) => s + r.has, 0);
  const netHas      = toplamAlis - toplamSatis;
  const islemSayisi = filtrelenmis.length;

  // Günlük grafik verisi
  const gunlukMap = {};
  filtrelenmis.forEach(r => {
    if (!gunlukMap[r.tarih]) gunlukMap[r.tarih] = { alis: 0, satis: 0 };
    if (r.tip === 'ALIS')  gunlukMap[r.tarih].alis  += r.has;
    else                    gunlukMap[r.tarih].satis += r.has;
  });
  const gunler = Object.entries(gunlukMap).slice(-14).reverse();
  const alisGrafik  = gunler.map(([label, v]) => ({ label, deger: v.alis  })).reverse();
  const satisGrafik = gunler.map(([label, v]) => ({ label, deger: v.satis })).reverse();

  // Ayar dağılımı
  const ayarDagilim = AYARLAR.map(ayar => ({
    ayar,
    deger: filtrelenmis.filter(r => r.ayar === ayar).reduce((s, r) => s + r.has, 0),
  }));

  const exportPDF = () => window.open('http://localhost:8000/rapor/pdf', '_blank');

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-ink-900 tracking-tight">Raporlar</h1>
          <p className="text-sm text-ink-400 mt-0.5">Sesli işlem analizi ve dönemsel özet</p>
        </div>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-ink-800 hover:bg-ink-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95"
        >
          <Download size={15} /> PDF İndir
        </button>
      </div>

      {/* Filtreler */}
      <div className="bg-white border border-ink-100 rounded-2xl px-5 py-4 flex flex-wrap gap-3 items-center mb-6 shadow-sm">
        <div className="flex items-center gap-2 bg-ink-50 px-4 py-2.5 rounded-xl border border-ink-100">
          <Calendar size={13} className="text-ink-400" />
          <select
            className="bg-transparent border-none text-sm font-semibold outline-none text-ink-700 appearance-none cursor-pointer"
            value={aralik}
            onChange={e => setAralik(e.target.value)}
          >
            <option value="7">Son 7 Gün</option>
            <option value="30">Son 30 Gün</option>
            <option value="90">Son 90 Gün</option>
          </select>
        </div>

        <div className="relative flex items-center gap-2 bg-ink-50 px-4 py-2.5 rounded-xl border border-ink-100">
          <Filter size={13} className="text-ink-400" />
          <select
            className="bg-transparent border-none text-sm font-semibold outline-none text-ink-700 appearance-none pr-4 cursor-pointer"
            value={tip}
            onChange={e => setTip(e.target.value)}
          >
            <option value="">Alış & Satış</option>
            <option value="ALIS">Sadece Alış</option>
            <option value="SATIS">Sadece Satış</option>
          </select>
          <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
        </div>

        <div className="relative flex items-center gap-2 bg-ink-50 px-4 py-2.5 rounded-xl border border-ink-100">
          <select
            className="bg-transparent border-none text-sm font-semibold outline-none text-ink-700 appearance-none pr-4 cursor-pointer"
            value={personel}
            onChange={e => setPersonel(e.target.value)}
          >
            <option value="">Tüm Personeller</option>
            {PERSONELLER.map(p => <option key={p}>{p}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
        </div>
      </div>

      {/* KPI kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Toplam Alış',   value: toplamAlis.toFixed(3),  unit: 'gr has', icon: TrendingUp,   bg: 'bg-emerald-50', border: 'border-emerald-100', ic: 'bg-emerald-100 text-emerald-700', vc: 'text-emerald-800' },
          { label: 'Toplam Satış',  value: toplamSatis.toFixed(3), unit: 'gr has', icon: TrendingDown, bg: 'bg-red-50',     border: 'border-red-100',     ic: 'bg-red-100 text-red-700',         vc: 'text-red-800'     },
          { label: 'Net Has',       value: netHas.toFixed(3),       unit: 'gr',     icon: BarChart2,    bg: 'bg-gold-50',   border: 'border-gold-100',    ic: 'bg-gold-100 text-gold-700',       vc: 'text-gold-800'    },
          { label: 'İşlem Sayısı',  value: islemSayisi,             unit: 'adet',   icon: Calendar,     bg: 'bg-ink-50',    border: 'border-ink-100',     ic: 'bg-ink-100 text-ink-700',         vc: 'text-ink-800'     },
        ].map((k, i) => (
          <div key={i} className={`stat-card ${k.bg} border ${k.border} rounded-2xl p-5`}>
            <div className={`w-9 h-9 rounded-xl ${k.ic} flex items-center justify-center mb-4`}>
              <k.icon size={17} />
            </div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider mb-1">{k.label}</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-black font-display ${k.vc}`}>{k.value}</span>
              <span className="text-xs text-ink-400">{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Grafikler */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Alış grafiği */}
        <div className="lg:col-span-1 bg-white border border-ink-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <p className="text-sm font-bold text-ink-800">Günlük Alış</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">Has altın (gram)</p>
          <MiniBarChart data={alisGrafik} renk="bg-emerald-400 hover:bg-emerald-500" />
        </div>

        {/* Satış grafiği */}
        <div className="lg:col-span-1 bg-white border border-ink-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <p className="text-sm font-bold text-ink-800">Günlük Satış</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">Has altın (gram)</p>
          <MiniBarChart data={satisGrafik} renk="bg-red-400 hover:bg-red-500" />
        </div>

        {/* Ayar dağılımı */}
        <div className="bg-white border border-ink-100 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-bold text-ink-800 mb-1">Ayar Dağılımı</p>
          <p className="text-xs text-ink-400 mb-4">Has altına göre %</p>
          <DonutChart segments={ayarDagilim} />
        </div>
      </div>

      {/* Detay tablosu */}
      <div className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink-800">İşlem Detayları</h2>
            <p className="text-xs text-ink-400 mt-0.5">{filtrelenmis.length} kayıt</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-ink-50">
                {['Tarih', 'Saat', 'Personel', 'İşlem', 'Ayar', 'Brüt (gr)', 'Has (gr)'].map(h => (
                  <th key={h} className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {filtrelenmis.slice(0, 50).map((r, idx) => (
                <tr key={idx} className="hover:bg-ink-50/50 transition-colors">
                  <td className="px-5 py-3 text-xs font-mono text-ink-600">{r.tarih}</td>
                  <td className="px-5 py-3 text-xs font-mono text-ink-400">{r.saat}</td>
                  <td className="px-5 py-3 text-sm font-medium text-ink-700">{r.personel}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${
                      r.tip === 'SATIS' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.tip === 'SATIS' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                      {r.tip === 'SATIS' ? 'Satış' : 'Alış'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gold-50 text-gold-700 border border-gold-100">
                      {AYAR_LABEL[r.ayar]}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono font-bold text-sm text-ink-800">{r.brut}</td>
                  <td className="px-5 py-3 font-mono font-black text-sm text-ink-900">{r.has}</td>
                </tr>
              ))}
              {filtrelenmis.length > 50 && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-center text-xs text-ink-400">
                    İlk 50 kayıt gösteriliyor · PDF'te tümü mevcut
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
