import { useEffect, useMemo, useState } from 'react';
import { Download, TrendingUp, TrendingDown, BarChart2, Calendar, Filter, ChevronDown } from 'lucide-react';

// YENİ: Altın, Sarrafiye ve Pırlanta seçeneklerini kapsayan sözlük
const URUN_CINSILERI = ['24_AYAR', '22_AYAR', '18_AYAR', '14_AYAR', 'CEYREK_ALTIN', 'YARIM_ALTIN', 'TAM_ALTIN', 'ATA_ALTIN', 'PIRLANTA'];
const URUN_LABEL = { 
  '24_AYAR': '24 Ayar', '22_AYAR': '22 Ayar', '18_AYAR': '18 Ayar', '14_AYAR': '14 Ayar',
  'CEYREK_ALTIN': 'Çeyrek', 'YARIM_ALTIN': 'Yarım', 'TAM_ALTIN': 'Tam', 'ATA_ALTIN': 'Ata',
  'PIRLANTA': 'Pırlanta'
};
const API_BASE = 'http://localhost:8000';

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
          <div className="absolute bottom-full mb-2 hidden group-hover:block bg-ink-800 text-white text-[12px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap z-10">
            {d.label}: {d.deger.toFixed(2)} gr
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Donut chart (SVG) ────────────────────────────────────────────────────────
const DonutChart = ({ segments }) => {
  // YENİ: Dinamik renk havuzu (Sarrafiyeler için renkler eklendi)
  const renkHavuzu = ['#F59E0B', '#D97706', '#92400E', '#3D3933', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];
  const aktifSegmentler = segments.filter(s => s.deger > 0); // Sadece değeri olanları göster
  const total = aktifSegmentler.reduce((s, x) => s + x.deger, 0);
  
  let offset = 0;
  const r = 40, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEECEA" strokeWidth="12" />
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEECEA" strokeWidth="12" />
        ) : aktifSegmentler.map((seg, i) => {
          const pct = seg.deger / total;
          const dash = circ * pct;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={renkHavuzu[i % renkHavuzu.length]}
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
      <div className="space-y-2 flex-1 max-h-28 overflow-y-auto pr-2">
        {aktifSegmentler.map((seg, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: renkHavuzu[i % renkHavuzu.length] }} />
              <span className="text-xs text-ink-600 font-medium">{URUN_LABEL[seg.ayar] || seg.ayar}</span>
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
  const bugunObj = new Date();
  const todayStr = new Date(bugunObj.getTime() - (bugunObj.getTimezoneOffset() * 60000))
    .toISOString()
    .split('T')[0];

  const [mode, setMode] = useState('days');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [customDays, setCustomDays] = useState('30');
  
  const [tip, setTip] = useState('');
  const [personel, setPersonel] = useState('');
  const [islemler, setIslemler] = useState([]);
  const [personeller, setPersoneller] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState('');

  const getQueryParams = () => {
    const params = new URLSearchParams();
    if (mode === 'range') {
      params.set('start_date', startDate);
      params.set('end_date', endDate);
    } else if (mode === 'single') {
      params.set('start_date', startDate);
      params.set('end_date', startDate); 
    } else if (mode === 'days') {
      params.set('gunler', customDays || '30');
    }
    if (tip) params.set('tip', tip);
    if (personel) params.set('personel_id', personel);
    return params;
  };

  const islemGetir = async () => {
    try {
      setLoading(true);
      setHata('');
      const params = getQueryParams();
      const res = await fetch(`${API_BASE}/islemler?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'İşlemler yüklenemedi.');
      setIslemler(data);
    } catch (err) {
      setHata(err.message || 'İşlemler yüklenemedi.');
      setIslemler([]);
    } finally {
      setLoading(false);
    }
  };

  const personelGetir = async () => {
    try {
      const res = await fetch(`${API_BASE}/personeller`);
      const data = await res.json();
      if (res.ok) setPersoneller(data);
    } catch (_) {
      setPersoneller([]);
    }
  };

  useEffect(() => {
    personelGetir();
  }, []);

  useEffect(() => {
    islemGetir();
  }, [mode, startDate, endDate, customDays, tip, personel]);

  const exportPDF = () => {
    const params = getQueryParams();
    window.open(`${API_BASE}/rapor/pdf?${params.toString()}`, '_blank');
  };

  const filtrelenmis = useMemo(() => {
    return islemler.map((r) => {
      const tarihObj = r.islem_tarihi ? new Date(r.islem_tarihi) : null;
      
      // YENİ: Backend henüz islem_birimi göndermiyorsa bile üründen birimi tahmin edelim
      const isAdet = ['PIRLANTA', 'CEYREK_ALTIN', 'YARIM_ALTIN', 'TAM_ALTIN', 'ATA_ALTIN'].includes(r.urun_cinsi);
      
      return {
        id: r.id,
        tarih: tarihObj ? tarihObj.toLocaleDateString('tr-TR') : '—',
        tarihObj,
        saat: tarihObj ? tarihObj.toLocaleTimeString('tr-TR') : '—',
        tip: r.islem_tipi,
        ayar: r.urun_cinsi,
        personel: r.personel_ad_soyad || 'Bilinmiyor',
        miktar: Number(r.brut_miktar || 0), // Yeni backend'de brut_miktar içine asıl miktar kaydediliyor
        birim: r.islem_birimi || (isAdet ? 'ADET' : 'GRAM'),
        has: Number(r.net_has_miktar || 0),
        birim_fiyat: Number(r.birim_fiyat || 0),
      };
    });
  }, [islemler]);

  const toplamAlis  = filtrelenmis.filter(r => r.tip === 'ALIS').reduce((s, r) => s + r.has, 0);
  const toplamSatis = filtrelenmis.filter(r => r.tip === 'SATIS').reduce((s, r) => s + r.has, 0);
  const netHas      = toplamAlis - toplamSatis;
  const islemSayisi = filtrelenmis.length;

  const gunlukMap = {};
  filtrelenmis.forEach(r => {
    if (!gunlukMap[r.tarih]) gunlukMap[r.tarih] = { alis: 0, satis: 0 };
    if (r.tip === 'ALIS')  gunlukMap[r.tarih].alis  += r.has;
    else                    gunlukMap[r.tarih].satis += r.has;
  });
  const gunler = Object.entries(gunlukMap).slice(-14).reverse();
  const alisGrafik  = gunler.map(([label, v]) => ({ label, deger: v.alis  })).reverse();
  const satisGrafik = gunler.map(([label, v]) => ({ label, deger: v.satis })).reverse();

  // YENİ: Sadece has değeri olan işlemlerin dağılımını göster (Pırlanta grafiğe dahil olmaz)
  const ayarDagilim = URUN_CINSILERI.map(ayar => ({
    ayar,
    deger: filtrelenmis.filter(r => r.ayar === ayar).reduce((s, r) => s + r.has, 0),
  }));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-ink-900 tracking-tight">Raporlar</h1>
          <p className="text-sm text-ink-400 mt-0.5">Dinamik sorgulama ve dönemsel özet</p>
        </div>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-ink-800 hover:bg-ink-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95"
        >
          <Download size={15} /> PDF İndir
        </button>
      </div>

      {/* Dinamik Filtreler */}
      <div className="bg-white border border-ink-100 rounded-2xl px-5 py-4 flex flex-wrap gap-4 items-center mb-6 shadow-sm">
        <div className="flex bg-ink-50 p-1 rounded-xl border border-ink-100">
          <button onClick={() => setMode('range')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'range' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-400 hover:text-ink-600'}`}>Tarih Aralığı</button>
          <button onClick={() => setMode('single')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'single' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-400 hover:text-ink-600'}`}>Tek Gün</button>
          <button onClick={() => setMode('days')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'days' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-400 hover:text-ink-600'}`}>Son X Gün</button>
        </div>

        <div className="flex items-center gap-2">
          {mode === 'range' && (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-ink-50 border border-ink-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-700 outline-none focus:ring-2 focus:ring-gold-400" />
              <span className="text-ink-300 font-bold">-</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-ink-50 border border-ink-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-700 outline-none focus:ring-2 focus:ring-gold-400" />
            </>
          )}
          {mode === 'single' && <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-ink-50 border border-ink-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-700 outline-none focus:ring-2 focus:ring-gold-400" />}
          {mode === 'days' && (
             <div className="flex items-center gap-2 bg-ink-50 px-3 py-2 rounded-xl border border-ink-100 focus-within:ring-2 focus-within:ring-gold-400">
                <Calendar size={14} className="text-ink-400" />
                <input type="number" min="1" value={customDays} onChange={e => setCustomDays(e.target.value)} className="bg-transparent border-none text-sm font-semibold outline-none text-ink-700 w-16" placeholder="Gün" />
                <span className="text-xs font-bold text-ink-400">Gün</span>
             </div>
          )}
        </div>

        <div className="w-[1px] h-6 bg-ink-100 mx-1 hidden md:block"></div>

        <div className="relative flex items-center gap-2 bg-ink-50 px-4 py-2.5 rounded-xl border border-ink-100">
          <Filter size={13} className="text-ink-400" />
          <select className="bg-transparent border-none text-sm font-semibold outline-none text-ink-700 appearance-none pr-4 cursor-pointer" value={tip} onChange={e => setTip(e.target.value)}>
            <option value="">Alış & Satış</option>
            <option value="ALIS">Sadece Alış</option>
            <option value="SATIS">Sadece Satış</option>
          </select>
          <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
        </div>

        <div className="relative flex items-center gap-2 bg-ink-50 px-4 py-2.5 rounded-xl border border-ink-100">
          <select className="bg-transparent border-none text-sm font-semibold outline-none text-ink-700 appearance-none pr-4 cursor-pointer" value={personel} onChange={e => setPersonel(e.target.value)}>
            <option value="">Tüm Personeller</option>
            {personeller.map(p => <option key={p.id} value={String(p.id)}>{p.ad_soyad}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
        </div>
      </div>

      {hata && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{hata}</div>}
      {loading && <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2 text-sm font-semibold text-ink-600">Rapor verileri yükleniyor...</div>}

      {/* KPI kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Toplam Alış',   value: toplamAlis.toFixed(3),  unit: 'gr has', icon: TrendingUp,   bg: 'bg-emerald-50', border: 'border-emerald-100', ic: 'bg-emerald-100 text-emerald-700', vc: 'text-emerald-800' },
          { label: 'Toplam Satış',  value: toplamSatis.toFixed(3), unit: 'gr has', icon: TrendingDown, bg: 'bg-red-50',     border: 'border-red-100',     ic: 'bg-red-100 text-red-700',         vc: 'text-red-800'     },
          { label: 'Net Has',       value: netHas.toFixed(3),      unit: 'gr',     icon: BarChart2,    bg: 'bg-gold-50',   border: 'border-gold-100',    ic: 'bg-gold-100 text-gold-700',       vc: 'text-gold-800'    },
          { label: 'İşlem Sayısı',  value: islemSayisi,            unit: 'adet',   icon: Calendar,     bg: 'bg-ink-50',    border: 'border-ink-100',     ic: 'bg-ink-100 text-ink-700',         vc: 'text-ink-800'     },
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
        <div className="lg:col-span-1 bg-white border border-ink-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <p className="text-sm font-bold text-ink-800">Günlük Alış</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">Has altın (gram)</p>
          <MiniBarChart data={alisGrafik} renk="bg-emerald-400 hover:bg-emerald-500" />
        </div>

        <div className="lg:col-span-1 bg-white border border-ink-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <p className="text-sm font-bold text-ink-800">Günlük Satış</p>
          </div>
          <p className="text-xs text-ink-400 mb-4">Has altın (gram)</p>
          <MiniBarChart data={satisGrafik} renk="bg-red-400 hover:bg-red-500" />
        </div>

        <div className="bg-white border border-ink-100 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-bold text-ink-800 mb-1">Ürün / Ayar Dağılımı</p>
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
              <tr className="border-b border-ink-50 bg-ink-50/30">
                {['Tarih', 'Saat', 'Personel', 'İşlem', 'Ürün', 'Miktar', 'Has Karşılığı', 'Tutar (TL)'].map(h => (
                  <th key={h} className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {filtrelenmis.slice(0, 50).map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/50 transition-colors">
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
                      {URUN_LABEL[r.ayar] || r.ayar}
                    </span>
                  </td>
                  {/* YENİ: Miktar dinamik (Adet veya gr) */}
                  <td className="px-5 py-3 font-mono font-bold text-sm text-ink-800">
                    {r.miktar} <span className="text-[10px] text-ink-400 font-sans ml-0.5">{r.birim === 'ADET' ? 'Adet' : 'gr'}</span>
                  </td>
                  {/* Pırlanta ise has 0 olduğu için - gösterir */}
                  <td className="px-5 py-3 font-mono font-black text-sm text-ink-900">
                    {r.has > 0 ? r.has : '-'}
                  </td>
                  {/* YENİ: Tutar Sütunu */}
                  <td className="px-5 py-3 font-mono font-bold text-sm text-ink-600">
                    {r.birim_fiyat > 0 ? `₺${r.birim_fiyat.toLocaleString('tr-TR')}` : '-'}
                  </td>
                </tr>
              ))}
              {filtrelenmis.length > 50 && (
                <tr>
                  <td colSpan={8} className="px-5 py-4 text-center text-xs text-ink-400">
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