import React, { useState, useEffect } from 'react';
import { PlusCircle, User, Calculator, Tag, Wallet, Layers, CreditCard, Banknote } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../apiConfig';

// Merkezi sarrafiye değerleri (backend SARRAFIYE_CONFIG ile tam uyumlu)
const SARRAFIYE_HAS_MAP = {
  CEYREK_ALTIN: 1.6030,
  YARIM_ALTIN:  3.2060,
  TAM_ALTIN:    6.4120,
  ATA_ALTIN:    6.5952,
};

export const ManualIslemForm = () => {
  const [loading, setLoading]     = useState(false);
  const [personeller, setPersoneller] = useState([]);
  const [basariMesaji, setBasariMesaji] = useState('');

  const [formData, setFormData] = useState({
    personel_id:     '',
    islem_tipi:      'ALIS',
    urun_kategorisi: 'ALTIN',
    urun_cinsi:      '22_AYAR',
    brut_miktar:     '',
    birim_fiyat:     '',
    odeme_tipi:      'NAKIT',
  });

  // Personel listesi
  useEffect(() => {
    axios.get(`${API_BASE}/personeller`)
      .then(res => setPersoneller(res.data))
      .catch(err => console.error('Personel listesi alınamadı:', err));
  }, []);

  // Kategoriye göre ürün seçenekleri
  const getUrunSecenekleri = () => {
    switch (formData.urun_kategorisi) {
      case 'SARRAFIYE':
        return [
          { value: 'CEYREK_ALTIN', label: 'Çeyrek Altın  (1.75 gr)' },
          { value: 'YARIM_ALTIN',  label: 'Yarım Altın   (3.50 gr)' },
          { value: 'TAM_ALTIN',    label: 'Tam Altın     (7.00 gr)' },
          { value: 'ATA_ALTIN',    label: 'Ata Altın     (7.20 gr)' },
        ];
      case 'PIRLANTA':
        return [{ value: 'PIRLANTA', label: 'Pırlanta / Mücevher' }];
      default:
        return [
          { value: '24_AYAR', label: '24 Ayar (Has)' },
          { value: '22_AYAR', label: '22 Ayar' },
          { value: '18_AYAR', label: '18 Ayar' },
          { value: '14_AYAR', label: '14 Ayar' },
        ];
    }
  };

  // Kategori değişince ürün cinsini sıfırla
  useEffect(() => {
    const options = getUrunSecenekleri();
    setFormData(prev => ({ ...prev, urun_cinsi: options[0].value }));
  }, [formData.urun_kategorisi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sarrafiye has önizlemesi
  const hasOnizleme = (() => {
    if (formData.urun_kategorisi !== 'SARRAFIYE') return null;
    const adet = parseFloat(formData.brut_miktar);
    const has  = SARRAFIYE_HAS_MAP[formData.urun_cinsi];
    if (!adet || !has) return null;
    return (adet * has).toFixed(4);
  })();

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setBasariMesaji('');
    try {
      const payload = {
        ...formData,
        personel_id: parseInt(formData.personel_id),
        brut_miktar: parseFloat(formData.brut_miktar),
        birim_fiyat: parseFloat(formData.birim_fiyat || 0),
        islem_birimi: formData.urun_kategorisi === 'ALTIN' ? 'GRAM' : 'ADET',
        adet: formData.urun_kategorisi !== 'ALTIN' ? parseInt(formData.brut_miktar) : 1,
      };

      await axios.post(`${API_BASE}/islemler`, payload);

      // Inline başarı mesajı — alert() yerine
      setBasariMesaji('✓ İşlem başarıyla kaydedildi');
      setFormData(prev => ({ ...prev, brut_miktar: '', birim_fiyat: '' }));
      setTimeout(() => setBasariMesaji(''), 4000);
    } catch (err) {
      alert('Hata: ' + (err.response?.data?.detail || 'İşlem kaydedilemedi'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <PlusCircle className="text-gold-600" size={20} />
        <h3 className="font-bold text-slate-800">Manuel İşlem Girişi</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Personel */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
            <User size={14} /> İşlemi Yapan Personel
          </label>
          <select
            required
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none"
            value={formData.personel_id}
            onChange={e => handleChange('personel_id', e.target.value)}
          >
            <option value="">Personel Seçiniz...</option>
            {personeller.map(p => (
              <option key={p.id} value={p.id}>{p.ad_soyad}</option>
            ))}
          </select>
        </div>

        {/* İşlem Tipi + Kategori */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">İşlem Tipi</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none"
              value={formData.islem_tipi}
              onChange={e => handleChange('islem_tipi', e.target.value)}
            >
              <option value="ALIS">Müşteriden Alış (+)</option>
              <option value="SATIS">Müşteriye Satış (-)</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
              <Layers size={14} /> Ürün Kategorisi
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none"
              value={formData.urun_kategorisi}
              onChange={e => handleChange('urun_kategorisi', e.target.value)}
            >
              <option value="ALTIN">Altın (Gram)</option>
              <option value="SARRAFIYE">Sarrafiye (Adet)</option>
              <option value="PIRLANTA">Pırlanta</option>
            </select>
          </div>
        </div>

        {/* Ürün Cinsi + Miktar */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
              <Tag size={14} /> {formData.urun_kategorisi === 'ALTIN' ? 'Ürün Ayarı' : 'Ürün Cinsi'}
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none"
              value={formData.urun_cinsi}
              onChange={e => handleChange('urun_cinsi', e.target.value)}
            >
              {getUrunSecenekleri().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
              <Calculator size={14} /> Miktar ({formData.urun_kategorisi === 'ALTIN' ? 'Gram' : 'Adet'})
            </label>
            <input
              type="number" step="0.01" required placeholder="0.00"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none"
              value={formData.brut_miktar}
              onChange={e => handleChange('brut_miktar', e.target.value)}
            />
            {/* Sarrafiye has önizlemesi */}
            {hasOnizleme && (
              <p className="text-[11px] text-amber-600 font-semibold mt-1">
                ≈ {hasOnizleme} gr has altın karşılığı
              </p>
            )}
          </div>
        </div>

        {/* Fiyat */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
            <Wallet size={14} /> Toplam Fiyat (TL)
          </label>
          <input
            type="number" step="1" placeholder="0"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 outline-none"
            value={formData.birim_fiyat}
            onChange={e => handleChange('birim_fiyat', e.target.value)}
          />
        </div>

        {/* Ödeme Tipi Seçici */}
        <div>
          <label className="text-sm font-medium text-slate-600 mb-2 block">Ödeme Tipi</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleChange('odeme_tipi', 'NAKIT')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                formData.odeme_tipi === 'NAKIT'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
              }`}
            >
              <Banknote size={15} /> Nakit
            </button>
            <button
              type="button"
              onClick={() => handleChange('odeme_tipi', 'KART')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                formData.odeme_tipi === 'KART'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
              }`}
            >
              <CreditCard size={15} /> Kart
            </button>
          </div>
        </div>

        {/* Başarı mesajı */}
        {basariMesaji && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-emerald-700">
            {basariMesaji}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full mt-2 py-3 rounded-lg font-bold text-white transition-all ${
            loading
              ? 'bg-slate-400 cursor-not-allowed'
              : formData.odeme_tipi === 'KART'
                ? 'bg-blue-600 hover:bg-blue-700 shadow-md active:scale-95'
                : 'bg-gold-600 hover:bg-gold-700 shadow-md active:scale-95'
          }`}
        >
          {loading ? 'Kaydediliyor...' : `İŞLEMİ KAYDET · ${formData.odeme_tipi}`}
        </button>
      </form>
    </div>
  );
};