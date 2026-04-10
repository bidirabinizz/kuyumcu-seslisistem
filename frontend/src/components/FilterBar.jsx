import { Download, Filter, CalendarDays, ChevronDown } from 'lucide-react';

export const FilterBar = ({ onExport, filters, onChange }) => (
  <div className="bg-[#f8fafc] border border-[#d4af37]/20 rounded-3xl px-5 py-4 flex flex-wrap gap-3 items-center justify-between shadow-sm">
    <div className="flex flex-wrap gap-3 items-center">
      {/* Personel filtre */}
      <div className="relative flex items-center gap-2 bg-[#f8fafc] border border-[#d4af37]/20 px-4 py-2.5 rounded-xl hover:border-[#d4af37]/30 transition-colors">
        <Filter size={13} className="text-ink-400" />
        <select
          className="bg-transparent border-none text-sm font-semibold outline-none text-gold-500 pr-5 appearance-none cursor-pointer"
          value={filters?.personel || ''}
          onChange={e => onChange?.({ ...filters, personel: e.target.value })}
        >
          <option value="">Tüm Personeller</option>
          <option value="ahmet">Ahmet Çapar</option>
          <option value="zeynep">Zeynep Yılmaz</option>
        </select>
        <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
      </div>

      {/* İşlem tipi */}
      <div className="relative flex items-center gap-2 bg-[#f8fafc] border border-[#d4af37]/20 px-4 py-2.5 rounded-xl hover:border-[#d4af37]/30 transition-colors">
        <select
          className="bg-transparent border-none text-sm font-semibold outline-none text-gold-500 pr-5 appearance-none cursor-pointer"
          value={filters?.tip || ''}
          onChange={e => onChange?.({ ...filters, tip: e.target.value })}
        >
          <option value="">Alış & Satış</option>
          <option value="ALIS">Sadece Alış</option>
          <option value="SATIS">Sadece Satış</option>
        </select>
        <ChevronDown size={12} className="absolute right-3 text-ink-400 pointer-events-none" />
      </div>

      {/* Tarih */}
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

    {/* PDF export */}
    <button
      onClick={onExport}
      className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-ink-900/20 active:scale-95"
    >
      <Download size={15} className="text-gold-500" />
      PDF Rapor Al
    </button>
  </div>
);
