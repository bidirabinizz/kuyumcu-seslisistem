import { useState, useEffect } from 'react';
import { Mic, RotateCcw, Trash2, Edit2, AlertTriangle, X, CheckCircle, Calculator, Wallet } from 'lucide-react';

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

// onEdit prop'unu ekledik
export const IslemTable = ({ islemler, onUndo, onEdit }) => {
  // Modal State'leri
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, islem: null });
  const [editModal, setEditModal] = useState({ isOpen: false, islem: null });
  
  // Düzenleme Formu State'i
  const [formData, setFormData] = useState({
    islem_tipi: 'ALIS',
    urun_cinsi: '22_AYAR',
    miktar: '',
    birim_fiyat: ''
  });

  // Düzenle modalı açıldığında mevcut verileri forma doldur
  useEffect(() => {
    if (editModal.islem) {
      setFormData({
        islem_tipi: editModal.islem.tip,
        urun_cinsi: editModal.islem.ayar,
        miktar: editModal.islem.miktar,
        birim_fiyat: editModal.islem.birim_fiyat || 0
      });
    }
  }, [editModal.islem]);

  const handleDeleteConfirm = () => {
    if (onUndo && deleteModal.islem) {
      onUndo(deleteModal.islem.id);
    }
    setDeleteModal({ isOpen: false, islem: null });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (onEdit && editModal.islem) {
      onEdit(editModal.islem.id, {
        ...formData,
        brut_miktar: parseFloat(formData.miktar),
        birim_fiyat: parseFloat(formData.birim_fiyat)
      });
    }
    setEditModal({ isOpen: false, islem: null });
  };

  return (
    <>
      {/* Orijinal Tablo Tasarımı */}
      <div className="bg-[#f8fafc] rounded-3xl border border-[#d4af37]/20 shadow-[0_10px_25px_rgba(0,0,0,0.05)] mt-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-ink-100 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-base font-bold text-ink-800">Son Hareketler</h2>
            <p className="text-xs text-ink-400 mt-0.5">Sistemdeki tüm işlemler</p>
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
                      <p className="text-sm text-ink-400 font-medium">İşlem bulunmuyor…</p>
                    </div>
                  </td>
                </tr>
              ) : (
                islemler.map((islem, idx) => (
                  <tr
                    key={islem.id || idx}
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
                    <td className="px-6 py-4 text-right space-x-1">
                      {/* DÜZENLE BUTONU */}
                      
<button
  onClick={() => setEditModal({ isOpen: true, islem: islem })}
  className="p-2 text-slate-700 opacity-40 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all group-hover:opacity-100"
  title="İşlemi Düzenle"
>
  <Edit2 size={16} />
</button>

{/* SİL BUTONU (İkonunu mevcut RotateCcw olarak bıraktım) */}
<button
  onClick={() => setDeleteModal({ isOpen: true, islem: islem })}
  className="p-2 text-slate-700 opacity-40 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all group-hover:opacity-100"
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

      {/* ================= SİLME ONAY MODALI (Arka Plan Blurlu) ================= */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100">
            <div className="bg-red-50 p-6 text-center border-b border-red-100">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-red-700 mb-2">İşlemi Sil?</h3>
              <p className="text-red-600/80 text-sm">Bu işlemi kalıcı olarak silmek istediğinize emin misiniz? Kasa bakiyesi güncellenecektir.</p>
            </div>
            
            <div className="p-6 bg-slate-50">
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-center mb-6 shadow-sm">
                <span className="block font-mono font-bold text-slate-800">
                  {deleteModal.islem?.miktar} gr {AYAR_LABEL[deleteModal.islem?.ayar]} {deleteModal.islem?.tip === 'ALIS' ? 'Alış' : 'Satış'}
                </span>
                {deleteModal.islem?.personel_ad_soyad && (
                  <span className="block text-xs text-slate-500 mt-1">{deleteModal.islem?.personel_ad_soyad}</span>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, islem: null })}
                  className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-500/30"
                >
                  Evet, Sil
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= DÜZENLEME MODALI (Arka Plan Blurlu) ================= */}
      {editModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-100">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">İşlemi Düzenle</h3>
                  <p className="text-xs text-slate-500">Sistem ID: #{editModal.islem?.id}</p>
                </div>
              </div>
              <button onClick={() => setEditModal({ isOpen: false, islem: null })} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İşlem Tipi</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.islem_tipi}
                    onChange={(e) => setFormData({...formData, islem_tipi: e.target.value})}
                  >
                    <option value="ALIS">Müşteriden Alış</option>
                    <option value="SATIS">Müşteriye Satış</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Ayar</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.urun_cinsi}
                    onChange={(e) => setFormData({...formData, urun_cinsi: e.target.value})}
                  >
                    <option value="24_AYAR">24 Ayar</option>
                    <option value="22_AYAR">22 Ayar</option>
                    <option value="18_AYAR">18 Ayar</option>
                    <option value="14_AYAR">14 Ayar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Miktar (Gram)</label>
                  <div className="relative">
                    <Calculator size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number" step="0.01" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.miktar}
                      onChange={(e) => setFormData({...formData, miktar: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Fiyat (TL)</label>
                  <div className="relative">
                    <Wallet size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number" step="1" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.birim_fiyat}
                      onChange={(e) => setFormData({...formData, birim_fiyat: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditModal({ isOpen: false, islem: null })}
                  className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 flex items-center justify-center gap-2 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-500/30"
                >
                  <CheckCircle size={18} /> Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};