import { useState, useEffect } from 'react';
import { Download, Filter, CalendarDays, ChevronDown } from 'lucide-react';

export const FilterBar = ({ onExport, filters, onChange }) => {
  const [personeller, setPersoneller] = useState([]);

  // Veritabanından gerçek personelleri çekiyoruz
  useEffect(() => {
    fetch('http://localhost:8000/personeller')
      .then(res => res.json())
      .then(data => setPersoneller(data))
      .catch(err => console.error("Personel listesi yüklenemedi:", err));
  }, []);

  return (
    <div className="bg-[#f8fafc] border border-[#d4af37]/20 rounded-3xl px-5 py-4 flex flex-wrap gap-3 items-center justify-between shadow-sm">
      <div className="flex flex-wrap gap-3 items-center">
        
        {/* Canlı Personel Filtresi */}
        <div className="relative flex items-center gap-2 bg-[#f8fafc] border border-[#d4af37]/20 px-4 py-2.5 rounded-xl hover:border-[#d4af37]/30 transition-colors">
          <Filter size={13} className="text-ink-400" />
          <select
            className="bg-transparent border-none text-sm font-semibold outline-none text-black pr-5 appearance-none cursor-pointer"
            value={filters?.personel_id || ''}
            onChange={e => onChange?.({ ...filters, personel_id: e.target.value })}
          >
            <option value="">Tüm Personeller</option>
            {personeller.map(p => (
              <option key={p.id} value={p.id}>
                {p.ad_soyad}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
        </div>

        {/* İşlem Tipi Filtresi */}
        <div className="relative flex items-center gap-2 bg-[#f8fafc] border border-[#d4af37]/20 px-4 py-2.5 rounded-xl hover:border-[#d4af37]/30 transition-colors">
          <select
            className="bg-transparent border-none text-sm font-semibold outline-none text-black pr-5 appearance-none cursor-pointer"
            value={filters?.tip || ''}
            onChange={e => onChange?.({ ...filters, tip: e.target.value })}
          >
            <option value="">Alış & Satış</option>
            <option value="ALIS">Sadece Alış</option>
            <option value="SATIS">Sadece Satış</option>
          </select>
          <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
        </div>

        {/* Tarih Filtresi */}
        <div className="flex items-center gap-2 bg-ink-50 px-4 py-2.5 rounded-xl border border-ink-100 hover:border-ink-200 transition-colors">
          <CalendarDays size={13} className="text-ink-400" />
          <input
            type="date"
            className="bg-transparent border-none text-sm font-semibold outline-none text-ink-700 cursor-pointer"
            value={filters?.tarih || ''}
            onChange={e => onChange?.({ ...filters, tarih: e.target.value })}
          />
        </div>
      </div>

      {/* PDF Export Butonu */}
      <button
        onClick={onExport}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-ink-900/20 active:scale-95"
      >
        <Download size={15} className="text-gold-500" />
        PDF Rapor Al
      </button>
    </div>
  );
};