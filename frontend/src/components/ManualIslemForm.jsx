import React, { useState, useEffect } from 'react';
import { PlusCircle, User, Calculator, Tag, Wallet, Layers } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../config';

export const ManualIslemForm = () => {
  const [loading, setLoading] = useState(false);
  const [personeller, setPersoneller] = useState([]);
  const [formData, setFormData] = useState({
    personel_id: '',
    islem_tipi: 'ALIS',
    urun_kategorisi: 'ALTIN', // YENİ: Kategori varsayılanı
    urun_cinsi: '22_AYAR',
    brut_miktar: '',
    birim_fiyat: ''
  });

  // Sistemdeki personelleri dropdown için çekiyoruz
  useEffect(() => {
    axios.get(`${API_BASE}/personeller`)
      .then(res => setPersoneller(res.data))
      .catch(err => console.error("Personel listesi alınamadı:", err));
  }, []);

  // Kategoriye göre ürün seçeneklerini getiren fonksiyon
  const getUrunSecenekleri = () => {
    switch (formData.urun_kategorisi) {
      case 'SARRAFIYE':
        return [
          { value: 'CEYREK_ALTIN', label: 'Çeyrek Altın' },
          { value: 'YARIM_ALTIN', label: 'Yarım Altın' },
          { value: 'TAM_ALTIN', label: 'Tam Altın' },
          { value: 'ATA_ALTIN', label: 'Ata Altın' }
        ];
      case 'PIRLANTA':
        return [{ value: 'PIRLANTA', label: 'Pırlanta / Mücevher' }];
      default: // ALTIN
        return [
          { value: '24_AYAR', label: '24 Ayar (Has)' },
          { value: '22_AYAR', label: '22 Ayar' },
          { value: '18_AYAR', label: '18 Ayar' },
          { value: '14_AYAR', label: '14 Ayar' }
        ];
    }
  };

  // Kategori değiştiğinde ürün cinsini (ayar) o kategorinin ilk seçeneğine eşitle
  useEffect(() => {
    const options = getUrunSecenekleri();
    setFormData(prev => ({ ...prev, urun_cinsi: options[0].value }));
  }, [formData.urun_kategorisi]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Backend'e gönderilecek veriyi hazırla (yeni alanlarla birlikte)
      const payload = {
        ...formData,
        personel_id: parseInt(formData.personel_id),
        brut_miktar: parseFloat(formData.brut_miktar),
        birim_fiyat: parseFloat(formData.birim_fiyat || 0),
        islem_birimi: formData.urun_kategorisi === 'ALTIN' ? 'GRAM' : 'ADET' // Kategoriye göre birimi backend için belirle
      };

      await axios.post(`${API_BASE}/islemler`, payload);
      
      // Formu temizle (Personel, Kategori ve İşlem Tipi sabit kalsın, hız kazandırır)
      setFormData({ ...formData, brut_miktar: '', birim_fiyat: '' });
      alert("İşlem başarıyla kaydedildi!");
    } catch (err) {
      alert("Hata: " + (err.response?.data?.detail || "İşlem kaydedilemedi"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <PlusCircle className="text-indigo-600" size={20} />
        <h3 className="font-bold text-slate-800">Manuel İşlem Girişi</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Personel Seçimi (Tam Genişlik) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
            <User size={14} /> İşlemi Yapan Personel
          </label>
          <select
            required
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={formData.personel_id}
            onChange={(e) => setFormData({...formData, personel_id: e.target.value})}
          >
            <option value="">Personel Seçiniz...</option>
            {personeller.map(p => (
              <option key={p.id} value={p.id}>{p.ad_soyad}</option>
            ))}
          </select>
        </div>

        {/* 1. Satır: İşlem Tipi ve Kategori */}
        <div className="grid grid-cols-2 gap-4">
          {/* İşlem Tipi */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
              İşlem Tipi
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.islem_tipi}
              onChange={(e) => setFormData({...formData, islem_tipi: e.target.value})}
            >
              <option value="ALIS">Müşteriden Alış (+)</option>
              <option value="SATIS">Müşteriye Satış (-)</option>
            </select>
          </div>

          {/* Kategori Seçimi (YENİ) */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
              <Layers size={14} /> Ürün Kategorisi
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.urun_kategorisi}
              onChange={(e) => setFormData({...formData, urun_kategorisi: e.target.value})}
            >
              <option value="ALTIN">Altın (Gram)</option>
              <option value="SARRAFIYE">Sarrafiye (Adet)</option>
              <option value="PIRLANTA">Pırlanta</option>
            </select>
          </div>
        </div>

        {/* 2. Satır: Ürün Cinsi ve Miktar */}
        <div className="grid grid-cols-2 gap-4">
          {/* Ürün Cinsi / Ayar (Dinamik) */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
              <Tag size={14} /> {formData.urun_kategorisi === 'ALTIN' ? 'Ürün Ayarı' : 'Ürün Cinsi'}
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.urun_cinsi}
              onChange={(e) => setFormData({...formData, urun_cinsi: e.target.value})}
            >
              {getUrunSecenekleri().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Miktar (Dinamik Etiket: Gram / Adet) */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
              <Calculator size={14} /> Miktar ({formData.urun_kategorisi === 'ALTIN' ? 'Gram' : 'Adet'})
            </label>
            <input
              type="number" step="0.01" required placeholder="0.00"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.brut_miktar}
              onChange={(e) => setFormData({...formData, brut_miktar: e.target.value})}
            />
          </div>
        </div>

        {/* 3. Satır: Fiyat (Tam Genişlik) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-1">
            <Wallet size={14} /> Toplam Fiyat (TL / Döviz)
          </label>
          <input
            type="number" step="1" required placeholder="0"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={formData.birim_fiyat}
            onChange={(e) => setFormData({...formData, birim_fiyat: e.target.value})}
          />
        </div>

        <button
          type="submit" disabled={loading}
          className={`w-full mt-4 py-3 rounded-lg font-bold text-white transition-all ${
            loading ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-95'
          }`}
        >
          {loading ? 'Kaydediliyor...' : 'İŞLEMİ KAYDET'}
        </button>
      </form>

      
    
    </div>
  );
};