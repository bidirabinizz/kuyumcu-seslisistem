import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { API_BASE } from '../apiConfig';
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  ChevronUp, ChevronDown, Loader2, X, Save, Tag, Package, Tablet, GripVertical, Search, Star
} from 'lucide-react';
import { InfoTooltip } from '../components/InfoTooltip';

// ─── Renk paleti (hem admin hem tablet için tutarlı) ─────────────────────────
export const RENK_MAP = {
  yellow: { bg: 'bg-yellow-50',  border: 'border-yellow-300', text: 'text-yellow-800', dot: 'bg-yellow-400' },
  amber:  { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800',  dot: 'bg-amber-400' },
  orange: { bg: 'bg-orange-50',  border: 'border-orange-300', text: 'text-orange-800', dot: 'bg-orange-400' },
  red:    { bg: 'bg-red-50',     border: 'border-red-300',    text: 'text-red-800',    dot: 'bg-red-400' },
  purple: { bg: 'bg-purple-50',  border: 'border-purple-300', text: 'text-purple-800', dot: 'bg-purple-400' },
  blue:   { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800',   dot: 'bg-blue-400' },
  green:  { bg: 'bg-green-50',   border: 'border-green-300',  text: 'text-green-800',  dot: 'bg-green-400' },
  gray:   { bg: 'bg-gray-50',    border: 'border-gray-300',   text: 'text-gray-800',   dot: 'bg-gray-400' },
};

const BOSH_FORM = {
  ad: '', urun_cinsi: '', urun_kategorisi: '',
  islem_birimi: 'GRAM', milyem: '', alis_milyem: '', satis_milyem: '', has_karsiligi: '',
  renk: 'amber', sira: 0, aktif: true,
  mobil_aktif: true, favori: false, stok_takibi: false,
};

const BOSH_KAT_FORM = { ad: '', etiket: '', renk: 'amber', sira: 0, aktif: true };

// ─── ÜRÜN MODAL ───────────────────────────────────────────────────────────────
function UrunModal({ urun, kategoriler, onClose, onSave }) {
  const [form, setForm] = useState(urun ? {
    ...urun,
    milyem: urun.milyem ?? '',
    alis_milyem: urun.alis_milyem ?? '',
    satis_milyem: urun.satis_milyem ?? '',
    has_karsiligi: urun.has_karsiligi ?? '',
    mobil_aktif: urun.mobil_aktif ?? true,
    favori: urun.favori ?? false,
    stok_takibi: urun.stok_takibi ?? false,
  } : {
    ...BOSH_FORM,
    urun_kategorisi: kategoriler[0]?.ad ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleKategori = (kat) => {
    set('urun_kategorisi', kat);
    // İşlem birimi için otomasyon: kategori adına göre değil,
    // kullanıcı seçimine göre elle ayarlanacak. Varsayılan: GRAM
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.ad.trim() || !form.urun_cinsi.trim()) {
      setHata('Ad ve Ürün Kodu zorunludur.');
      return;
    }
    if (!form.urun_kategorisi) {
      setHata('Lütfen bir kategori seçin.');
      return;
    }
    setLoading(true);
    setHata('');
    try {
      const isGram = form.islem_birimi === 'GRAM';
      const isAdet = form.islem_birimi === 'ADET';
      const payload = {
        ...form,
        milyem: isAdet ? 0 : (parseFloat(form.milyem) || 0),
        alis_milyem: isAdet ? 0 : (parseFloat(form.alis_milyem) || 0),
        satis_milyem: isAdet ? 0 : (parseFloat(form.satis_milyem) || 0),
        has_karsiligi: isGram ? 0 : (parseFloat(form.has_karsiligi) || 0),
        sira: parseInt(form.sira) || 0,
      };
      if (urun) {
        await axios.put(`${API_BASE}/urunler/${urun.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/urunler`, payload);
      }
      onSave();
    } catch (err) {
      setHata(err.response?.data?.detail || 'Kayıt başarısız.');
    } finally {
      setLoading(false);
    }
  };

  const seciliKat = kategoriler.find(k => k.ad === form.urun_kategorisi);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-800 text-lg">
            {urun ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Ad */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Ürün Adı *
              <InfoTooltip text="Ürünün arayüzde ve faturalarda görüntülenecek anlaşılır ismi (Örn: 22 Ayar Bilezik)." />
            </label>
            <input
              required value={form.ad}
              onChange={e => set('ad', e.target.value)}
              placeholder="Örn: 22 Ayar Bilezik"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
            />
          </div>

          {/* Ürün Kodu */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Ürün Kodu * <span className="text-xs text-gray-400">(DB'ye yazılan kod, boşluksuz)</span>
              <InfoTooltip text="Veritabanında ürünü tanımlayan benzersiz kod. Boşluksuz ve büyük harflerle girilmelidir (Örn: 22_AYAR_BILEZIK)." />
            </label>
            <input
              required value={form.urun_cinsi}
              onChange={e => set('urun_cinsi', e.target.value.toUpperCase().replace(/\s/g, '_'))}
              placeholder="Örn: 22_AYAR_BILEZIK"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-amber-400 outline-none"
            />
          </div>


          {/* Kategori — dinamik */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Kategori *
              <InfoTooltip text="Ürünün ait olduğu ana kategori grubu. Hesaplama ve raporlama yöntemini doğrudan etkiler." />
            </label>
            {kategoriler.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Henüz kategori yok. Önce "Kategoriler" sekmesinden kategori ekleyin.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {kategoriler.map(k => (
                  <button
                    key={k.id} type="button"
                    onClick={() => handleKategori(k.ad)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${
                      form.urun_kategorisi === k.ad
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'border-gray-200 text-gray-500 hover:border-amber-300'
                    }`}
                  >
                    {k.etiket}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hesaplama parametreleri */}
          <div className="space-y-3">
            {/* İşlem Birimi */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                İşlem Birimi
                <InfoTooltip text="Ürünün tartılarak mı (GRAM) yoksa sayılarak mı (ADET) işlem göreceğini belirler." />
              </label>
              <select
                value={form.islem_birimi}
                onChange={e => set('islem_birimi', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
              >
                <option value="GRAM">GRAM</option>
                <option value="ADET">ADET</option>
              </select>
            </div>

            {/* Milyem Alanları - sadece GRAM seçiliyken */}
            {form.islem_birimi !== 'ADET' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">✨ Milyem Ayarları</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-green-700 mb-1">
                      Alış Milyemi <span className="text-gray-400 font-normal">(0–1)</span>
                      <InfoTooltip text="Ürünü alırken kullanılacak milyem değeri. Altın alındığında has hesabı bu değerle yapılır (Örn: 0.9160)." />
                    </label>
                    <input
                      type="number" step="0.0001" min="0" max="1"
                      value={form.alis_milyem}
                      onChange={e => set('alis_milyem', e.target.value)}
                      placeholder="0.9160"
                      className="w-full border border-green-200 bg-green-50 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-blue-700 mb-1">
                      Satış Milyemi <span className="text-gray-400 font-normal">(0–1)</span>
                      <InfoTooltip text="Ürünü satarken kullanılacak milyem değeri. Altın satıldığında has hesabı bu değerle yapılır (Örn: 0.9160)." />
                    </label>
                    <input
                      type="number" step="0.0001" min="0" max="1"
                      value={form.satis_milyem}
                      onChange={e => set('satis_milyem', e.target.value)}
                      placeholder="0.9160"
                      className="w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Genel Milyem <span className="text-gray-400 font-normal">(0–1, yedek)</span>
                    <InfoTooltip text="Alış/Satış milyemi girilmemişse yedek olarak kullanılır. Ayrıca raporlama ve teknik hesaplamalarda referans değer olarak kullanılır." />
                  </label>
                  <input
                    type="number" step="0.0001" min="0" max="1"
                    value={form.milyem}
                    onChange={e => set('milyem', e.target.value)}
                    placeholder="0.9160"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Has karşılığı - sadece ADET seçiliyken */}
            {form.islem_birimi !== 'GRAM' && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Has Karş. <span className="text-xs text-gray-400">(gr/adet)</span>
                  <InfoTooltip text="Adet bazlı sarrafiye ürünleri için tek bir adedin sahip olduğu sabit has altın gram karşılığı (Örn: Çeyrek için 1.6030)." />
                </label>
                <input
                  type="number" step="0.0001" min="0"
                  value={form.has_karsiligi}
                  onChange={e => set('has_karsiligi', e.target.value)}
                  placeholder="1.6030"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                />
              </div>
            )}
          </div>

          {/* Sıra + Renk */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Sıra
                <InfoTooltip text="Kasa ekranındaki butonların sıralama düzeni. Küçük sayılar üstte listelenir." />
              </label>
              <input
                type="number" min="0"
                value={form.sira}
                onChange={e => set('sira', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Buton Rengi
                <InfoTooltip text="Kasa tablet ekranında bu ürün butonunun arka planında kullanılacak görsel renk teması." />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(RENK_MAP).map(([key, val]) => (
                  <button
                    key={key} type="button"
                    onClick={() => set('renk', key)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${val.dot} ${
                      form.renk === key ? 'border-gray-800 scale-110' : 'border-transparent'
                    }`}
                    title={key}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Mobil Görünürlük */}
          <div className="flex items-center gap-2 py-1 select-none">
            <input
              type="checkbox"
              id="mobil_aktif"
              checked={form.mobil_aktif}
              onChange={e => set('mobil_aktif', e.target.checked)}
              className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-400 cursor-pointer"
            />
            <label htmlFor="mobil_aktif" className="text-xs font-semibold text-gray-600 cursor-pointer flex items-center gap-1">
              Mobilde (Tablet/Ses) Göster
              <InfoTooltip text="Bu ürünün kasa tablet ekranında ve mobil sesli sistemde menü butonu olarak listelenip listelenmeyeceğini kontrol eder." />
            </label>
          </div>

          {/* Stok Takibi */}
          <div className="flex items-center gap-2 py-1 select-none">
            <input
              type="checkbox"
              id="stok_takibi"
              checked={form.stok_takibi}
              onChange={e => set('stok_takibi', e.target.checked)}
              className="w-4 h-4 text-indigo-500 border-gray-300 rounded focus:ring-indigo-400 cursor-pointer"
            />
            <label htmlFor="stok_takibi" className="text-xs font-semibold text-gray-600 cursor-pointer flex items-center gap-1">
              Stok Takibi Yapılsın mı?
              <InfoTooltip text="Bu özellik açıldığında, ürün satılırken veya alınırken stok listeden barkod/sertifika seçilmesi zorunlu olur." />
            </label>
          </div>

          {hata && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{hata}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-all"
            >
              İptal
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {urun ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── KATEGORİ MODAL ───────────────────────────────────────────────────────────
function KategoriModal({ kategori, onClose, onSave }) {
  const [form, setForm] = useState(kategori ? { ...kategori } : { ...BOSH_KAT_FORM });
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.ad.trim() || !form.etiket.trim()) {
      setHata('Kategori kodu ve etiketi zorunludur.');
      return;
    }
    setLoading(true);
    setHata('');
    try {
      const payload = {
        ad: form.ad.trim().toUpperCase().replace(/\s/g, '_'),
        etiket: form.etiket.trim(),
        renk: form.renk,
        sira: parseInt(form.sira) || 0,
        aktif: form.aktif,
      };
      if (kategori) {
        await axios.put(`${API_BASE}/kategoriler/${kategori.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/kategoriler`, payload);
      }
      onSave();
    } catch (err) {
      setHata(err.response?.data?.detail || 'Kayıt başarısız.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg">
            {kategori ? 'Kategori Düzenle' : 'Yeni Kategori Ekle'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Kategori Kodu * <span className="text-xs text-gray-400">(Büyük harf, boşluksuz — Örn: BEYAZ_ALTIN)</span>
              <InfoTooltip text="Veritabanında kategoriyi tanımlayan benzersiz kod (Örn: SARRAFIYE, PIRLANTA, BEYAZ_ALTIN)." />
            </label>
            <input
              required value={form.ad}
              onChange={e => set('ad', e.target.value.toUpperCase().replace(/\s/g, '_'))}
              placeholder="Örn: GÜMÜS"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-amber-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Etiket * <span className="text-xs text-gray-400">(Kullanıcıya görünen ad — Örn: 🥈 Gümüş)</span>
              <InfoTooltip text="Kasa ekranında ve menülerde kullanıcılara gösterilecek ikonlu veya düz etiket adı." />
            </label>
            <input
              required value={form.etiket}
              onChange={e => set('etiket', e.target.value)}
              placeholder="Örn: 🥈 Gümüş"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Sıra
                <InfoTooltip text="Kategorinin menü ve listelerdeki sıralama düzeni." />
              </label>
              <input
                type="number" min="0"
                value={form.sira}
                onChange={e => set('sira', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Renk
                <InfoTooltip text="Kategorinin arayüzdeki görsel renk kodu teması." />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(RENK_MAP).map(([key, val]) => (
                  <button
                    key={key} type="button"
                    onClick={() => set('renk', key)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${val.dot} ${
                      form.renk === key ? 'border-gray-800 scale-110' : 'border-transparent'
                    }`}
                    title={key}
                  />
                ))}
              </div>
            </div>
          </div>

          {hata && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{hata}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-all"
            >
              İptal
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {kategori ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── KATEGORİLER PANELİ ───────────────────────────────────────────────────────
function KategorilerPaneli({ onRefresh }) {
  const [kategoriler, setKategoriler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [silOnay, setSilOnay] = useState(null);
  const [silHata, setSilHata] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
  };

  const handleDrop = async (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const sirali = [...kategoriler].sort((a, b) => a.sira - b.sira);
    const draggedItem = sirali[draggedIndex];
    sirali.splice(draggedIndex, 1);
    sirali.splice(index, 0, draggedItem);

    const siraliIdListesi = sirali.map(k => k.id);
    const guncelKategoriler = sirali.map((k, idx) => ({ ...k, sira: idx + 1 }));
    setKategoriler(guncelKategoriler);

    try {
      await axios.post(`${API_BASE}/kategoriler/sirala`, { sirali_id_listesi: siraliIdListesi });
      yukle();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Kategoriler sıralanamadı:', err);
      yukle();
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const yukle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/kategoriler?hepsi=true`);
      setKategoriler(res.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  const handleSil = async (id) => {
    setSilHata('');
    try {
      await axios.delete(`${API_BASE}/kategoriler/${id}`);
      setSilOnay(null);
      yukle();
      if (onRefresh) onRefresh();
    } catch (err) {
      setSilHata(err.response?.data?.detail || 'Silinemedi.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-gray-900">Kategori Yönetimi</h2>
          <p className="text-sm text-gray-500 mt-1">Ürün kategorilerini buradan ekleyin, düzenleyin ve silin.</p>
        </div>
        <button
          onClick={() => setModal('ekle')}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition-all shadow-sm"
        >
          <Plus size={16} /> Yeni Kategori
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Yükleniyor...
          </div>
        ) : kategoriler.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🏷️</p>
            <p className="font-semibold">Henüz kategori yok</p>
            <p className="text-sm mt-1">Sağ üstten yeni kategori ekleyin.</p>
          </div>
        ) : (
          <table className="w-full text-sm select-none">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-3 w-10"></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Renk</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Etiket</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kod</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Sıra</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Aktif</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...kategoriler].sort((a, b) => a.sira - b.sira).map((k, idx) => {
                const renkObj = RENK_MAP[k.renk] || RENK_MAP.amber;
                const isDragging = draggedIndex === idx;
                return (
                  <tr
                    key={k.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`hover:bg-gray-50/50 transition-colors ${!k.aktif ? 'opacity-50' : ''} ${
                      isDragging ? 'bg-amber-50/50 border-y-2 border-dashed border-amber-300' : ''
                    }`}
                  >
                    <td className="px-3 py-3 text-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                      <GripVertical size={16} className="mx-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block w-3.5 h-3.5 rounded-full ${renkObj.dot}`} />
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800">{k.etiket}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{k.ad}</td>
                    <td className="px-4 py-3 text-center text-gray-500 font-bold">{k.sira}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${k.aktif ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setModal(k)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                        ><Pencil size={14} /></button>
                        <button
                          onClick={() => { setSilHata(''); setSilOnay(k); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                        ><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        💡 Kategoriler ürünlerde, kasa ekranında ve toptancı cari defterinde kullanılır. Ürünü olan kategoriler silinemez.
      </p>

      {modal && (
        <KategoriModal
          kategori={modal === 'ekle' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); yukle(); if (onRefresh) onRefresh(); }}
        />
      )}

      {silOnay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-800 text-lg mb-2">Kategoriyi Sil?</h3>
            <p className="text-sm text-gray-500 mb-3">
              <span className="font-semibold text-gray-800">"{silOnay.etiket}"</span> kategorisi kalıcı olarak silinecek.
            </p>
            {silHata && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{silHata}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setSilOnay(null); setSilHata(''); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-semibold hover:bg-gray-50"
              >İptal</button>
              <button
                onClick={() => handleSil(silOnay.id)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600"
              >Sil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STOK YÖNETİMİ MODAL ───────────────────────────────────────────────────────
function StokYonetimiModal({ urun, onClose }) {
  const [stoklar, setStoklar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState('');
  
  const [yeniKod, setYeniKod] = useState('');
  const [yeniFiyat, setYeniFiyat] = useState('');
  const [yeniParaBirimi, setYeniParaBirimi] = useState('USD'); // 👈 EKLENDİ

  const fetchStok = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/urun_stok?urun_id=${urun.id}`);
      setStoklar(res.data);
    } catch (err) {
      setHata('Stoklar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [urun.id]);

  useEffect(() => { fetchStok(); }, [fetchStok]);

  const handleEkle = async (e) => {
    e.preventDefault();
    if (!yeniKod.trim() || !yeniFiyat) return;
    try {
      await axios.post(`${API_BASE}/urun_stok`, {
        urun_id: urun.id,
        kod: yeniKod,
        satis_fiyati: parseFloat(yeniFiyat),
        para_birimi: yeniParaBirimi // 👈 EKLENDİ
      });
      setYeniKod('');
      setYeniFiyat('');
      setYeniParaBirimi('USD'); // 👈 EKLENDİ
      fetchStok();
    } catch (err) {
      alert(err.response?.data?.detail || 'Stok eklenemedi');
    }
  };

  const handleSil = async (id) => {
    if (!window.confirm('Bu stok kodunu silmek istediğinize emin misiniz?')) return;
    try {
      await axios.delete(`${API_BASE}/urun_stok/${id}`);
      fetchStok();
    } catch (err) {
      alert('Silinemedi.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Stok Yönetimi</h2>
            <p className="text-xs text-gray-500">{urun.ad} ({urun.urun_cinsi})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {/* Urunler.jsx - Form JSX Kısmı (Satır 482 civarı) */}
<form onSubmit={handleEkle} className="flex gap-3 mb-6 items-end bg-gray-50 p-4 rounded-xl">
  <div className="flex-1">
    <label className="block text-xs font-semibold text-gray-600 mb-1">Stok Kodu</label>
    <input type="text" required value={yeniKod} onChange={e => setYeniKod(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Örn: PRL-001" />
  </div>
  <div className="flex-1">
    <label className="block text-xs font-semibold text-gray-600 mb-1">Alış Fiyat</label>
    <input type="number" step="0.01" required value={yeniFiyat} onChange={e => setYeniFiyat(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="0.00" />
  </div>
  {/* 👇 PARA BİRİMİ SEÇİM ALANI EKLENDİ 👇 */}
  <div className="w-24">
    <label className="block text-xs font-semibold text-gray-600 mb-1">Birim</label>
    <select value={yeniParaBirimi} onChange={e => setYeniParaBirimi(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
      <option value="USD">USD</option>
      <option value="EUR">EUR</option>
      <option value="TL">TL</option>
    </select>
  </div>
  {/* 👆 PARA BİRİMİ SEÇİM ALANI EKLENDİ 👆 */}
  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 flex items-center gap-2 h-[38px]">
    <Plus size={16} /> Ekle
  </button>
</form>


          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : hata ? (
            <div className="text-red-500 text-sm text-center">{hata}</div>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/80 text-gray-500 font-medium">
                  <tr>
                    <th className="px-4 py-3">Kod</th>
                    <th className="px-4 py-3 text-right">Alış Fiyat</th>
                    <th className="px-4 py-3 text-center">Durum</th>
                    <th className="px-4 py-3 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stoklar.length === 0 && (
                    <tr><td colSpan={4} className="p-4 text-center text-gray-500">Kayıtlı stok kodu yok.</td></tr>
                  )}
                  {stoklar.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{s.kod}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600">
                        {s.satis_fiyati?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {
                          s.para_birimi === 'USD' ? '$' : s.para_birimi === 'EUR' ? '€' : '₺'
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.satildi_mi 
                          ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-md font-medium">Satıldı</span>
                          : <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md font-medium">Stokta</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleSil(s.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
export function Urunler() {
  const [aktifSekme, setAktifSekme] = useState('urunler'); // 'urunler' | 'kategoriler'
  const [urunler, setUrunler] = useState([]);
  const [kategoriler, setKategoriler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [stokModal, setStokModal] = useState(null);
  const [silOnay, setSilOnay] = useState(null);
  const [draggedUrunIndex, setDraggedUrunIndex] = useState(null);

  // Filtreleme State'leri
  const [aramaSorgusu, setAramaSorgusu] = useState('');
  const [kategoriFiltresi, setKategoriFiltresi] = useState('');

  const [tabletFiltresi, setTabletFiltresi] = useState(''); // '', 'gosterilenler', 'gosterilmeyenler'
  const [aktiflikFiltresi, setAktiflikFiltresi] = useState(''); // '', 'aktif', 'pasif'

  const yukle = useCallback(async () => {
    setLoading(true);
    try {
      const [urunRes, katRes] = await Promise.all([
        axios.get(`${API_BASE}/urunler?hepsi=true`),
        axios.get(`${API_BASE}/kategoriler?hepsi=false`),
      ]);
      setUrunler(urunRes.data);
      setKategoriler(katRes.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  const handleToggleAktif = async (urun) => {
    try {
      await axios.put(`${API_BASE}/urunler/${urun.id}`, { aktif: !urun.aktif });
      yukle();
    } catch { /* ignore */ }
  };

  const handleToggleMobilAktif = async (urun) => {
    try {
      const guncel = urun.mobil_aktif === false ? true : false;
      await axios.put(`${API_BASE}/urunler/${urun.id}`, { mobil_aktif: guncel });
      yukle();
    } catch { /* ignore */ }
  };

  const handleSil = async (id) => {
    try {
      await axios.delete(`${API_BASE}/urunler/${id}`);
      setSilOnay(null);
      yukle();
    } catch { /* ignore */ }
  };

  const handleUrunDragStart = (e, index) => {
    if (isFilterActive) return;
    setDraggedUrunIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget);
  };

  const handleUrunDragOver = (e, index) => {
    if (isFilterActive) return;
    e.preventDefault();
  };

  const handleUrunDrop = async (e, index) => {
    e.preventDefault();
    if (isFilterActive) return;
    if (draggedUrunIndex === null || draggedUrunIndex === index) return;

    const sirali = [...urunler].sort((a, b) => a.sira - b.sira);
    const draggedItem = sirali[draggedUrunIndex];
    sirali.splice(draggedUrunIndex, 1);
    sirali.splice(index, 0, draggedItem);

    const updates = [];
    const guncelUrunler = sirali.map((u, idx) => {
      const yeniSira = idx + 1;
      if (u.sira !== yeniSira) {
        updates.push({ id: u.id, sira: yeniSira });
      }
      return { ...u, sira: yeniSira };
    });

    setUrunler(guncelUrunler);

    try {
      if (updates.length > 0) {
        await Promise.all(updates.map(u => axios.put(`${API_BASE}/urunler/${u.id}`, { sira: u.sira })));
        yukle();
      }
    } catch {
      yukle();
    }
    setDraggedUrunIndex(null);
  };

  const handleUrunDragEnd = () => {
    setDraggedUrunIndex(null);
  };

  // Kategori rengini bul
  const katRenk = (katAd) => {
    const kat = kategoriler.find(k => k.ad === katAd);
    const renkMap = {
      yellow: 'bg-yellow-100 text-yellow-800',
      amber:  'bg-amber-100 text-amber-800',
      orange: 'bg-orange-100 text-orange-800',
      red:    'bg-red-100 text-red-800',
      purple: 'bg-purple-100 text-purple-800',
      blue:   'bg-blue-100 text-blue-800',
      green:  'bg-green-100 text-green-800',
      gray:   'bg-gray-100 text-gray-600',
    };
    return renkMap[kat?.renk] || 'bg-gray-100 text-gray-600';
  };

  const katEtiket = (katAd) => {
    const kat = kategoriler.find(k => k.ad === katAd);
    return kat?.etiket || katAd;
  };


  // Filtrelerin aktif olup olmadığının kontrolü
  const isFilterActive = useMemo(() => {
    return (
      aramaSorgusu.trim() !== '' ||
      kategoriFiltresi !== '' ||
      tabletFiltresi !== '' ||
      aktiflikFiltresi !== ''
    );
  }, [aramaSorgusu, kategoriFiltresi, tabletFiltresi, aktiflikFiltresi]);

  // Filtrelenmiş ve sıralanmış ürünler listesi
  const filtrelenmisUrunler = useMemo(() => {
    return urunler.filter(u => {
      // 1. Arama Sorgusu
      if (aramaSorgusu.trim()) {
        const sorgu = aramaSorgusu.toLowerCase();
        const adEslesiyor = u.ad?.toLowerCase().includes(sorgu);
        const kodEslesiyor = u.urun_cinsi?.toLowerCase().includes(sorgu);
        if (!adEslesiyor && !kodEslesiyor) {
          return false;
        }
      }

      // 2. Kategori Filtresi
      if (kategoriFiltresi && u.urun_kategorisi !== kategoriFiltresi) {
        return false;
      }

      // 3. Tablet Görünürlük Filtresi
      if (tabletFiltresi) {
        const isMobilAktif = u.mobil_aktif !== false;
        if (tabletFiltresi === 'gosterilenler' && !isMobilAktif) return false;
        if (tabletFiltresi === 'gosterilmeyenler' && isMobilAktif) return false;
      }

      // 4. Aktiflik Durumu Filtresi
      if (aktiflikFiltresi) {
        if (aktiflikFiltresi === 'aktif' && !u.aktif) return false;
        if (aktiflikFiltresi === 'pasif' && u.aktif) return false;
      }

      return true;
    }).sort((a, b) => a.sira - b.sira);
  }, [urunler, aramaSorgusu, kategoriFiltresi, tabletFiltresi, aktiflikFiltresi]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Başlık + Sekmeler */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Ürün &amp; Kategori Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kasa ekranında görünecek ürünleri ve kategorileri buradan yönetin
          </p>
        </div>
        {aktifSekme === 'urunler' && (
          <button
            onClick={() => setModal('ekle')}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Plus size={16} /> Yeni Ürün
          </button>
        )}
      </div>

      {/* Sekme Butonları */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {[
          { key: 'urunler',     label: 'Ürünler',    icon: <Package size={14} /> },
          { key: 'kategoriler', label: 'Kategoriler', icon: <Tag size={14} /> },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setAktifSekme(s.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              aktifSekme === s.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Kategoriler Sekmesi */}
      {aktifSekme === 'kategoriler' && <KategorilerPaneli onRefresh={yukle} />}

      {/* Ürünler Sekmesi */}
      {aktifSekme === 'urunler' && (
        <>
          {/* Arama ve Filtreleme Paneli */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Arama Çubuğu */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Ürün adı, kod veya grup ara..."
                value={aramaSorgusu}
                onChange={e => setAramaSorgusu(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all"
              />
              {aramaSorgusu && (
                <button
                  onClick={() => setAramaSorgusu('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Dropdown Filtreler */}
            <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
              {/* Kategori Filtresi */}
              <select
                value={kategoriFiltresi}
                onChange={e => setKategoriFiltresi(e.target.value)}
                className="bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all cursor-pointer"
              >
                <option value="">Tüm Kategoriler</option>
                {kategoriler.map(k => (
                  <option key={k.id} value={k.ad}>{k.etiket}</option>
                ))}
              </select>

              {/* Tablet Görünürlük Filtresi */}
              <select
                value={tabletFiltresi}
                onChange={e => setTabletFiltresi(e.target.value)}
                className="bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all cursor-pointer"
              >
                <option value="">Tablet Görünürlüğü (Hepsi)</option>
                <option value="gosterilenler">Tablette Gösterilenler</option>
                <option value="gosterilmeyenler">Tablette Gösterilmeyenler</option>
              </select>

              {/* Durum Filtresi */}
              <select
                value={aktiflikFiltresi}
                onChange={e => setAktiflikFiltresi(e.target.value)}
                className="bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all cursor-pointer"
              >
                <option value="">Durum (Hepsi)</option>
                <option value="aktif">Aktif</option>
                <option value="pasif">Pasif</option>
              </select>

              {/* Temizle */}
              {isFilterActive && (
                <button
                  onClick={() => {
                    setAramaSorgusu('');
                    setKategoriFiltresi('');
                    setTabletFiltresi('');
                    setAktiflikFiltresi('');
                  }}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200/50 transition-all"
                >
                  <X size={12} /> Temizle
                </button>
              )}
            </div>
          </div>

          {/* Filtrelenen Ürün Sayısı Rozeti */}
          <div className="flex justify-between items-center mb-3 px-1">
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg select-none">
              {isFilterActive ? 'Eşleşen Ürün: ' : 'Toplam Ürün: '}
              <span className="text-gray-900 font-extrabold">{filtrelenmisUrunler.length}</span> / {urunler.length}
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 size={24} className="animate-spin mr-2" /> Yükleniyor...
              </div>
            ) : urunler.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📦</p>
                <p className="font-semibold">Henüz ürün yok</p>
              </div>
            ) : filtrelenmisUrunler.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-semibold">Eşleşen ürün bulunamadı</p>
                <p className="text-sm mt-1">Lütfen arama terimini veya filtreleri değiştirin.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">Sıra</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Renk</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ürün Adı</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kod</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Birim</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Milyem / Has</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Aktif</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Tablet</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Favori</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtrelenmisUrunler.map((u, idx, arr) => {
                    const renk = RENK_MAP[u.renk] || RENK_MAP.amber;
                    return (
                      <tr
                        key={u.id}
                        draggable={!isFilterActive}
                        onDragStart={(e) => handleUrunDragStart(e, idx)}
                        onDragOver={(e) => handleUrunDragOver(e, idx)}
                        onDrop={(e) => handleUrunDrop(e, idx)}
                        onDragEnd={handleUrunDragEnd}
                        className={`transition-colors ${
                          !u.aktif ? 'opacity-50' : ''
                        } ${
                          draggedUrunIndex === idx ? 'bg-amber-50/70 border-y-2 border-dashed border-amber-300' : 'hover:bg-gray-50/50'
                        }`}
                      >
                        <td className="px-4 py-3 select-none">
                          {isFilterActive ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-mono text-xs font-bold">
                              #{u.sira}
                            </span>
                          ) : (
                            <GripVertical
                              size={16}
                              className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition-colors mx-auto"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block w-3.5 h-3.5 rounded-full ${renk.dot}`} />
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{u.ad}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.urun_cinsi}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${katRenk(u.urun_kategorisi)}`}>
                            {katEtiket(u.urun_kategorisi)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.islem_birimi}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {u.milyem > 0
                            ? u.milyem.toFixed(4)
                            : u.has_karsiligi > 0
                              ? `${u.has_karsiligi.toFixed(4)} gr/adet`
                              : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => handleToggleAktif(u)} className="transition-colors">
                            {u.aktif
                              ? <ToggleRight size={22} className="text-emerald-500" />
                              : <ToggleLeft size={22} className="text-gray-300" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleToggleMobilAktif(u)}
                            className="transition-all hover:scale-110 active:scale-95"
                            title={u.mobil_aktif !== false ? 'Tablette Gösteriliyor' : 'Tablette Gösterilmiyor'}
                          >
                            <Tablet
                              size={18}
                              className={`mx-auto stroke-[2.5] ${u.mobil_aktif !== false ? 'text-emerald-500 fill-emerald-500/10' : 'text-gray-300'}`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={async () => {
                              try {
                                await axios.put(`${API_BASE}/urunler/${u.id}`, { favori: !u.favori });
                                yukle();
                              } catch(e) { console.error("Favori guncellenemedi", e) }
                            }}
                            className="transition-all hover:scale-110 active:scale-95"
                            title={u.favori ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                          >
                            <Star
                              size={20}
                              className={`mx-auto stroke-[2.5] ${u.favori ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {(u.stok_takibi === true) && (
                              <button
                                onClick={() => setStokModal(u)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                title="Stokları Yönet"
                              ><Package size={14} /></button>
                            )}
                            <button
                              onClick={() => setModal(u)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                              title="Düzenle"
                            ><Pencil size={14} /></button>
                            <button
                              onClick={() => setSilOnay(u)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                              title="Sil"
                            ><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">
            💡 Aktif ürünler kasa ekranında görünür. Sıra numarası küçük olan üstte görünür.
          </p>

          {modal && (
            <UrunModal
              urun={modal === 'ekle' ? null : modal}
              kategoriler={kategoriler}
              onClose={() => setModal(null)}
              onSave={() => { setModal(null); yukle(); }}
            />
          )}

          {stokModal && (
            <StokYonetimiModal
              urun={stokModal}
              onClose={() => setStokModal(null)}
            />
          )}

          {silOnay && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
              <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
                <h3 className="font-bold text-gray-800 text-lg mb-2">Ürünü Sil?</h3>
                <p className="text-sm text-gray-500 mb-5">
                  <span className="font-semibold text-gray-800">"{silOnay.ad}"</span> kalıcı olarak silinecek.
                  Geçmiş işlemler etkilenmez. Alternatif olarak pasif yapabilirsiniz.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSilOnay(null)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-semibold hover:bg-gray-50"
                  >İptal</button>
                  <button
                    onClick={() => handleSil(silOnay.id)}
                    className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600"
                  >Sil</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
