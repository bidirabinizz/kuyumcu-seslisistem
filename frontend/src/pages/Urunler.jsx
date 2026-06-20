import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../apiConfig';
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  ChevronUp, ChevronDown, Loader2, X, Save, Tag, Package, Tablet, GripVertical
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
  islem_birimi: 'GRAM', milyem: '', has_karsiligi: '',
  renk: 'amber', sira: 0, aktif: true, urun_grubu: 'Diğer',
  mobil_aktif: true,
};

const BOSH_KAT_FORM = { ad: '', etiket: '', renk: 'amber', sira: 0, aktif: true };

// ─── ÜRÜN MODAL ───────────────────────────────────────────────────────────────
function UrunModal({ urun, kategoriler, onClose, onSave }) {
  const [form, setForm] = useState(urun ? {
    ...urun,
    milyem: urun.milyem ?? '',
    has_karsiligi: urun.has_karsiligi ?? '',
    urun_grubu: urun.urun_grubu ?? 'Diğer',
    mobil_aktif: urun.mobil_aktif ?? true,
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
      const payload = {
        ...form,
        milyem: form.islem_birimi === 'ADET' ? 0 : (parseFloat(form.milyem) || 0),
        has_karsiligi: form.islem_birimi === 'GRAM' ? 0 : (parseFloat(form.has_karsiligi) || 0),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg">
            {urun ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
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

          {/* Ürün Grubu */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Ürün Grubu (Alt Kategori / Örn: Bilezik, Yüzük, Küpe)
              <InfoTooltip text="Raporlama ve gruplandırma amacıyla kullanılacak alt kategori." />
            </label>
            <input
              value={form.urun_grubu}
              onChange={e => set('urun_grubu', e.target.value)}
              placeholder="Örn: Bilezik"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={`block text-sm font-medium mb-1 ${form.islem_birimi === 'ADET' ? 'text-gray-400' : 'text-gray-600'}`}>
                Milyem <span className="text-xs text-gray-400">(0–1)</span>
                <InfoTooltip text="Milyem değeri (Örn: 22 Ayar için 0.9160). Brüt miktar ile çarpılarak net has miktarını bulur." />
              </label>
              <input
                type="number" step="0.0001" min="0" max="1"
                value={form.islem_birimi === 'ADET' ? '' : form.milyem}
                onChange={e => set('milyem', e.target.value)}
                placeholder={form.islem_birimi === 'ADET' ? '—' : '0.9160'}
                disabled={form.islem_birimi === 'ADET'}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none ${
                  form.islem_birimi === 'ADET' ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${form.islem_birimi === 'GRAM' ? 'text-gray-400' : 'text-gray-600'}`}>
                Has Karş. <span className="text-xs text-gray-400">(gr/adet)</span>
                <InfoTooltip text="Adet bazlı sarrafiye ürünleri için tek bir adedin sahip olduğu sabit has altın gram karşılığı (Örn: Çeyrek için 1.6030)." />
              </label>
              <input
                type="number" step="0.0001" min="0"
                value={form.islem_birimi === 'GRAM' ? '' : form.has_karsiligi}
                onChange={e => set('has_karsiligi', e.target.value)}
                placeholder={form.islem_birimi === 'GRAM' ? '—' : '1.6030'}
                disabled={form.islem_birimi === 'GRAM'}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none ${
                  form.islem_birimi === 'GRAM' ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''
                }`}
              />
            </div>
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
              <InfoTooltip text="Bu ürünün kasa tablet ekranında ve mobil sesli sistemde menü butonu olarak listelenip listelenmeyeceğini kontrol eder.
              
              #### [MODIFY] [IslemTable.jsx](file:///c:/Users/bidir/Desktop/caparkuyumculuk/frontend/src/components/IslemTable.jsx)
              - `AYAR_LABEL` ve `AYAR_COLOR` içerisine `USD` ve `EUR` anahtarları eklendi.
              - Ödeme tipi rozetlerinde döviz miktarı ve kuru gösterilerek premium tasarım sunuldu.
              - İşlem Düzenleme modalında döviz tutarı ve kurunu manuel güncelleme desteği sağlandı.

              #### [MODIFY] [Urunler.jsx](file:///c:/Users/bidir/Desktop/caparkuyumculuk/frontend/src/pages/Urunler.jsx)
              - Ürünler tablosuna **Tablet** adında yeni bir sütun eklenerek, ürünün mobil/tablet ekranda gösterilme durumu (`mobil_aktif`) için premium bir tablet cihazı simgesi yerleştirildi.
              - Simgelerin üzerine tıklandığında ürünün tablette görünürlüğünü doğrudan değiştirebilen `handleToggleMobilAktif` fonksiyonu entegre edildi: Aktif ise yeşil, kapalı/pasif ise gri renkli tablet simgesi gösterilmektedir." />
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

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
export function Urunler() {
  const [aktifSekme, setAktifSekme] = useState('urunler'); // 'urunler' | 'kategoriler'
  const [urunler, setUrunler] = useState([]);
  const [kategoriler, setKategoriler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [silOnay, setSilOnay] = useState(null);

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

  const handleSira = async (urun, yon) => {
    const mevcut = [...urunler].sort((a, b) => a.sira - b.sira);
    const idx = mevcut.findIndex(u => u.id === urun.id);
    const hedef = yon === 'up' ? mevcut[idx - 1] : mevcut[idx + 1];
    if (!hedef) return;
    await Promise.all([
      axios.put(`${API_BASE}/urunler/${urun.id}`, { sira: hedef.sira }),
      axios.put(`${API_BASE}/urunler/${hedef.id}`, { sira: urun.sira }),
    ]);
    yukle();
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
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">Sıra</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Renk</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ürün Adı</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kod</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Grup</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Birim</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Milyem / Has</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Aktif</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Tablet</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...urunler].sort((a, b) => a.sira - b.sira).map((u, idx, arr) => {
                    const renk = RENK_MAP[u.renk] || RENK_MAP.amber;
                    return (
                      <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${!u.aktif ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => handleSira(u, 'up')}
                              disabled={idx === 0}
                              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors"
                            ><ChevronUp size={14} /></button>
                            <button
                              onClick={() => handleSira(u, 'down')}
                              disabled={idx === arr.length - 1}
                              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors"
                            ><ChevronDown size={14} /></button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block w-3.5 h-3.5 rounded-full ${renk.dot}`} />
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{u.ad}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.urun_cinsi}</td>
                        <td className="px-4 py-3 text-gray-600 font-semibold">{u.urun_grubu || 'Diğer'}</td>
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
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setModal(u)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                            ><Pencil size={14} /></button>
                            <button
                              onClick={() => setSilOnay(u)}
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
