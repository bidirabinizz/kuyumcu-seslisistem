import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Calculator, CheckCircle2, Plus, ChevronDown, ChevronUp, Search, Info, X, BookOpen, Clock } from 'lucide-react';
import { useMarket } from '../hooks/useMarket';
import { InfoTooltip } from '../components/InfoTooltip';
import { API_BASE } from '../apiConfig';
import { parseTrNumber } from '../utils/numberFormat';

const disabledCellBg = {
  background: 'repeating-linear-gradient(45deg, #fcfcfb, #fcfcfb 6px, #f6f5f1 6px, #f6f5f1 12px)'
};

// Sabit Detay Seçenekleri
const DETAY_SECENEKLERI = {
  "Borçlanma": ["Mal Alış", "Has Altın Alış", "Nakit Borç Alma", "Kur Kesme / Fiksleme", "Diğer Borçlanma"],
  "Ödeme": ["Nakit Ödeme", "Hurda Teslimi", "Has Altın Teslimi", "Banka Havalesi", "Kur Kesme / Fiksleme", "Diğer Ödeme"]
};

// Sanal Nakit Ürünü (Ürün tablosunda olmayan, nakit ödemeler için sanal ürün)
const NAKIT_SANAL_URUN = {
  id: -99,
  ad: 'Nakit',
  urun_cinsi: 'NAKIT_TL',
  urun_kategorisi: 'NAKIT',
  milyem: 0,
  has_karsiligi: 0,
  urun_grubu: 'Para'
};

const formatHeaderDate = (dateStr, todayStr) => {
  if (dateStr === 'Tarihsiz') return 'Tarihsiz';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];
  const monthName = months[parseInt(month, 10) - 1];
  
  const formatted = `${day} ${monthName} ${year}`;
  if (dateStr === todayStr) {
    return `Bugün (${formatted})`;
  }
  return formatted;
};

export const ToptanciDetay = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { kurlar } = useMarket();
  
  const todayStr = React.useMemo(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .split('T')[0];
  }, []);

  const [data, setData] = useState({ toptanci: null, islemler: [] });
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState('total'); // 'total' | 'today' | 'week' | 'month' | 'custom'
  const [customRange, setCustomRange] = useState({ start: todayStr, end: todayStr });
  
  // Ürünler Listesi (DB'den çekilecek)
  const [urunlerListesi, setUrunlerListesi] = useState([]);
  // Kategoriler Listesi (DB'den çekilecek)
  const [kategorilerListesi, setKategorilerListesi] = useState([]);
  
  // Görünüm Seçeneği (false: Kronolojik Liste, true: Çift Sütun Klasik Defter)
  const [defterGorunumu, setDefterGorunumu] = useState(true);
  
  // Modal State
  const [modalAcik, setModalAcik] = useState(false);
  const [faturaNotu, setFaturaNotu] = useState('');

  const [expandedDates, setExpandedDates] = useState({});

  const toggleDate = (dateStr) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !(prev[dateStr] ?? (dateStr === todayStr))
    }));
  };
  
  // Ürün Seçici State
  const [urunSeciciAcik, setUrunSeciciAcik] = useState(false);
  const [activeSelectionRowId, setActiveSelectionRowId] = useState(null);
  const [urunAramaSorgusu, setUrunAramaSorgusu] = useState('');
  const [urunSeciciKategori, setUrunSeciciKategori] = useState('HEPSİ');
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  
  // Accordion & Search State
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [arama, setArama] = useState('');
  const [pendingFocusRowId, setPendingFocusRowId] = useState(null);
  
  const [fikslemePanelAcik, setFikslemePanelAcik] = useState(false);
  const [fikslemeYonu, setFikslemeYonu]           = useState('ALTIN_TO_PARA'); // 'ALTIN_TO_PARA' | 'PARA_TO_ALTIN'
  const [fikslemeMiktar, setFikslemeMiktar]       = useState('');
  const [fikslemeTutar, setFikslemeTutar]         = useState('');
  const [fikslemeParaBirimi, setFikslemeParaBirimi] = useState('TRY');
  const [fikslemeHedefParaBirimi, setFikslemeHedefParaBirimi] = useState('USD');
  const [fikslemeGramFiyat, setFikslemeGramFiyat] = useState('');
  const [fikslemeDovizKuru, setFikslemeDovizKuru] = useState('');

  // Fiş giriş penceresi kapatıldığında kur kes/fiksle panelini de kapat
  useEffect(() => {
    if (!modalAcik) {
      setFikslemePanelAcik(false);
    }
  }, [modalAcik]);

  const toggleFikslemePanel = () => {
    if (!fikslemePanelAcik) {
      const baseGold = kurlar?.gram_altin_24k_try || 0;
      setFikslemeYonu('ALTIN_TO_PARA');
      setFikslemeParaBirimi('TRY');
      setFikslemeGramFiyat(baseGold ? baseGold.toFixed(2) : '');
      setFikslemeDovizKuru('');
      const initMiktar = data.toptanci?.bakiye_has ? Math.abs(data.toptanci.bakiye_has) : 0;
      setFikslemeMiktar(initMiktar > 0 ? initMiktar.toFixed(3) : '');
      setFikslemeTutar(initMiktar > 0 && baseGold > 0 ? (initMiktar * baseGold).toFixed(2) : '');
    }
    setFikslemePanelAcik(!fikslemePanelAcik);
  };

  const createEmptyRow = () => ({
    id: Date.now() + Math.random(),
    islem_tipi: 'Borçlanma', 
    islem_detayi: 'Mal Alış',
    urun: '22 Ayar',
    urun_kodu: '22_AYAR',
    urun_kategorisi: 'ALTIN',
    adet: 1,
    brut: '',
    milyem: 0.9160,
    has_altin: '',
    tl_tutar: '',
    para_birimi: 'TRY',
    doviz_tutar: '',
    doviz_kuru: ''
  });

  const [kalemler, setKalemler] = useState([createEmptyRow()]);

  const fetchDetay = async () => {
    try {
      const res = await fetch(`${API_BASE}/toptancilar/${id}/islemler`);
      if (!res.ok) throw new Error('Bulunamadı');
      const d = await res.json();
      setData(d);
    } catch (err) {
      console.error(err);
      navigate('/toptancilar');
    } finally {
      setLoading(false);
    }
  };

  const handlePdfDownload = () => {
    let params = new URLSearchParams();
    if (activePeriod === 'today') {
      params.append('start_date', todayStr);
      params.append('end_date', todayStr);
    } else if (activePeriod === 'week') {
      params.append('gunler', '7');
    } else if (activePeriod === 'month') {
      params.append('gunler', '30');
    } else if (activePeriod === 'custom' && customRange.start && customRange.end) {
      params.append('start_date', customRange.start);
      params.append('end_date', customRange.end);
    }

    const url = `${API_BASE}/toptancilar/${id}/rapor/pdf?${params.toString()}`;
    window.open(url, '_blank');
  };

  const fetchUrunler = async () => {
    try {
      const [urunRes, katRes] = await Promise.all([
        fetch(`${API_BASE}/urunler`),
        fetch(`${API_BASE}/kategoriler`),
      ]);
      if (urunRes.ok) {
        const data = await urunRes.json();
        setUrunlerListesi(data);
      }
      if (katRes.ok) {
        const data = await katRes.json();
        setKategorilerListesi(data);
      }
    } catch (err) {
      console.error("Urunler/Kategoriler yuklenirken hata:", err);
    }
  };

  useEffect(() => {
    fetchDetay();
    fetchUrunler();
  }, [id]);

  // Yeni satır eklendiğinde ilk hücreye odaklanma hook'u
  useEffect(() => {
    if (pendingFocusRowId) {
      const timer = setTimeout(() => {
        const selector = `[data-row-id="${pendingFocusRowId}"] button`;
        const firstEl = document.querySelector(selector);
        if (firstEl) {
          firstEl.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [pendingFocusRowId]);

  // Modal açıldığında ilk satıra odaklanma
  useEffect(() => {
    if (modalAcik && kalemler.length > 0) {
      const timer = setTimeout(() => {
        const firstEl = document.querySelector(`[data-row-id="${kalemler[0].id}"] select`);
        if (firstEl) firstEl.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [modalAcik]);

  // Global Kısayol Tuşları (F2: Kaydet, ESC: Kapat)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!modalAcik) return;
      if (urunSeciciAcik) return; // Ürün seçici açıkken global kısayolları ezmeyelim
      
      if (e.key === 'F2') {
        e.preventDefault();
        handleCokluKaydet();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setModalAcik(false);
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [modalAcik, urunSeciciAcik, kalemler, faturaNotu]);

  // Arama ve Tarih filtresi uygulanmış işlemler
  const filtreliIslemler = React.useMemo(() => {
    let list = data?.islemler || [];

    // 1. Tarih Filtreleme
    if (activePeriod === 'today') {
      list = list.filter(islem => islem.islem_tarihi?.split('T')[0] === todayStr);
    } else if (activePeriod === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = new Date(weekAgo.getTime() - weekAgo.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];
      list = list.filter(islem => {
        const d = islem.islem_tarihi?.split('T')[0];
        return d >= weekAgoStr && d <= todayStr;
      });
    } else if (activePeriod === 'month') {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const monthAgoStr = new Date(monthAgo.getTime() - monthAgo.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];
      list = list.filter(islem => {
        const d = islem.islem_tarihi?.split('T')[0];
        return d >= monthAgoStr && d <= todayStr;
      });
    } else if (activePeriod === 'custom' && customRange.start && customRange.end) {
      list = list.filter(islem => {
        const d = islem.islem_tarihi?.split('T')[0];
        return d >= customRange.start && d <= customRange.end;
      });
    }

    // 2. Arama Filtreleme
    if (!arama) return list;
    const q = arama.toLowerCase();
    
    return list.filter(islem => {
      const tipMatch = islem.islem_tipi.toLowerCase().includes(q);
      const detayMatch = islem.islem_detayi.toLowerCase().includes(q);
      const aciklamaMatch = islem.aciklama && islem.aciklama.toLowerCase().includes(q);
      
      const dateObj = new Date(islem.islem_tarihi);
      const dateStr = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).toLowerCase();
      const dateMatch = dateStr.includes(q);
      
      return tipMatch || detayMatch || aciklamaMatch || dateMatch;
    });
  }, [data?.islemler, activePeriod, customRange, arama, todayStr]);

  // Çift sütun için listeler
  const solSayfaList = React.useMemo(() => filtreliIslemler.filter(i => i.islem_tipi === 'Borçlanma'), [filtreliIslemler]);
  const sagSayfaList = React.useMemo(() => filtreliIslemler.filter(i => i.islem_tipi === 'Ödeme'), [filtreliIslemler]);

  // Çift sütun toplam hesapları
  const solHasSum = React.useMemo(() => solSayfaList.reduce((acc, i) => acc + Math.abs(i.has_altin), 0), [solSayfaList]);
  const solTlSum = React.useMemo(() => solSayfaList.reduce((acc, i) => acc + Math.abs(i.tl_tutar), 0), [solSayfaList]);
  const solUsdSum = React.useMemo(() => solSayfaList.reduce((acc, i) => acc + Math.abs(i.usd_tutar || 0), 0), [solSayfaList]);
  const solEurSum = React.useMemo(() => solSayfaList.reduce((acc, i) => acc + Math.abs(i.eur_tutar || 0), 0), [solSayfaList]);
  const sagHasSum = React.useMemo(() => sagSayfaList.reduce((acc, i) => acc + Math.abs(i.has_altin), 0), [sagSayfaList]);
  const sagTlSum = React.useMemo(() => sagSayfaList.reduce((acc, i) => acc + Math.abs(i.tl_tutar), 0), [sagSayfaList]);
  const sagUsdSum = React.useMemo(() => sagSayfaList.reduce((acc, i) => acc + Math.abs(i.usd_tutar || 0), 0), [sagSayfaList]);
  const sagEurSum = React.useMemo(() => sagSayfaList.reduce((acc, i) => acc + Math.abs(i.eur_tutar || 0), 0), [sagSayfaList]);

  // Tarih gruplamaları
  const groupedSolSayfa = React.useMemo(() => {
    const groups = {};
    solSayfaList.forEach(islem => {
      const dateKey = islem.islem_tarihi?.split('T')[0] || 'Tarihsiz';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(islem);
    });
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({
        date,
        islemler: groups[date],
        hasSum: groups[date].reduce((acc, i) => acc + Math.abs(i.has_altin), 0),
        tlSum: groups[date].reduce((acc, i) => acc + Math.abs(i.tl_tutar), 0),
        usdSum: groups[date].reduce((acc, i) => acc + Math.abs(i.usd_tutar || 0), 0),
        eurSum: groups[date].reduce((acc, i) => acc + Math.abs(i.eur_tutar || 0), 0)
      }));
  }, [solSayfaList]);

  const groupedSagSayfa = React.useMemo(() => {
    const groups = {};
    sagSayfaList.forEach(islem => {
      const dateKey = islem.islem_tarihi?.split('T')[0] || 'Tarihsiz';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(islem);
    });
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({
        date,
        islemler: groups[date],
        hasSum: groups[date].reduce((acc, i) => acc + Math.abs(i.has_altin), 0),
        tlSum: groups[date].reduce((acc, i) => acc + Math.abs(i.tl_tutar), 0),
        usdSum: groups[date].reduce((acc, i) => acc + Math.abs(i.usd_tutar || 0), 0),
        eurSum: groups[date].reduce((acc, i) => acc + Math.abs(i.eur_tutar || 0), 0)
      }));
  }, [sagSayfaList]);

  const groupedChronological = React.useMemo(() => {
    const groups = {};
    filtreliIslemler.forEach(islem => {
      const dateKey = islem.islem_tarihi?.split('T')[0] || 'Tarihsiz';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(islem);
    });
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(date => {
        const list = groups[date];
        let hasNet = 0;
        let tlNet = 0;
        let usdNet = 0;
        let eurNet = 0;
        list.forEach(i => {
          const isBorc = i.islem_tipi === 'Borçlanma';
          hasNet = isBorc ? hasNet + Math.abs(i.has_altin) : hasNet - Math.abs(i.has_altin);
          tlNet = isBorc ? tlNet + Math.abs(i.tl_tutar) : tlNet - Math.abs(i.tl_tutar);
          usdNet = isBorc ? usdNet + Math.abs(i.usd_tutar || 0) : usdNet - Math.abs(i.usd_tutar || 0);
          eurNet = isBorc ? eurNet + Math.abs(i.eur_tutar || 0) : eurNet - Math.abs(i.eur_tutar || 0);
        });
        return {
          date,
          islemler: list,
          hasNet,
          tlNet,
          usdNet,
          eurNet
        };
      });
  }, [filtreliIslemler]);

  const handleYeniSatir = () => {
    const newRow = createEmptyRow();
    setKalemler([...kalemler, newRow]);
    setPendingFocusRowId(newRow.id);
  };

  const handleSatirSil = (kalemId) => {
    if(kalemler.length === 1) return; // Son satırı sildirmeyelim
    setKalemler(kalemler.filter(k => k.id !== kalemId));
  };

  // Ürün Seçici Klavye Yönetimi
  const handleUrunSeciciKeyDown = (e, filteredProducts) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedProductIndex(prev => Math.min(filteredProducts.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedProductIndex(prev => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts[highlightedProductIndex]) {
        handleUrunSec(activeSelectionRowId, filteredProducts[highlightedProductIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setUrunSeciciAcik(false);
      // Fiş modülündeki ilgili satıra geri dön
      setTimeout(() => {
        const selector = `[data-row-id="${activeSelectionRowId}"] button`;
        const el = document.querySelector(selector);
        if (el) el.focus();
      }, 50);
    }
  };

  // Bir Ürün Seçildiğinde Satır Değerlerini Güncelleme
  const handleUrunSec = (rowId, product) => {
    setKalemler(prev => prev.map(k => {
      if (k.id !== rowId) return k;
      
      const updated = { 
        ...k, 
        urun: product.ad,
        urun_kodu: product.urun_cinsi,
        urun_kategorisi: product.urun_kategorisi,
        milyem: product.milyem || 0,
        has_karsiligi: product.has_karsiligi || 0
      };
      
      // Kategori bazlı hesaplama ve kilit yönetimi
      if (product.urun_kategorisi === 'SARRAFIYE') {
        updated.has_altin = (updated.adet * product.has_karsiligi).toFixed(3);
        updated.brut = '';
        updated.milyem = 0;
      } else if (product.urun_kategorisi === 'NAKIT' || product.urun_kategorisi === 'PIRLANTA') {
        updated.has_altin = '';
        updated.brut = '';
        updated.milyem = 0;
        updated.adet = 1;
      } else {
        // ALTIN
        updated.has_altin = parseTrNumber(updated.brut) ? (parseTrNumber(updated.brut) * product.milyem).toFixed(3) : '';
        updated.adet = 1;
      }
      
      return updated;
    }));
    
    setUrunSeciciAcik(false);
    
    // Değer girişine odaklan (Sarrafiye ise Adet'e, Altın ise Brüt'e, Nakit ise TL'ye)
    setTimeout(() => {
      const rowSelector = `[data-row-id="${rowId}"]`;
      const rowEl = document.querySelector(rowSelector);
      if (rowEl) {
        let focusable = null;
        if (product.urun_kategorisi === 'SARRAFIYE') {
          focusable = rowEl.querySelector('input[type="number"]:not([disabled])'); // Adet
        } else if (product.urun_kategorisi === 'NAKIT') {
          focusable = rowEl.querySelectorAll('input[type="number"]')[1] || rowEl.querySelector('input[type="number"]'); // TL Tutar
        } else {
          focusable = rowEl.querySelector('input[placeholder="0.00"]'); // Brüt Gr
        }
        if (focusable) focusable.focus();
      }
    }, 50);
  };

  // Dinamik Hesaplama Motoru (Manuel Değişiklikler İçin)
  const updateKalem = (rowId, field, value) => {
    setKalemler(prev => prev.map(k => {
      if (k.id !== rowId) return k;
      
      const updated = { ...k, [field]: value };
      
      // İşlem tipi değişirse detay sıfırlansın
      if (field === 'islem_tipi') {
        const defaultDetay = DETAY_SECENEKLERI[value][0];
        updated.islem_detayi = defaultDetay;
        if (defaultDetay.includes('Nakit') || defaultDetay.includes('Banka') || defaultDetay.includes('Havale')) {
          updated.urun = 'Nakit';
          updated.urun_kodu = 'NAKIT_TL';
          updated.urun_kategorisi = 'NAKIT';
          updated.milyem = 0;
          updated.has_altin = '';
          updated.brut = '';
          updated.adet = 1;
        } else if (updated.urun === 'Nakit') {
          updated.urun = '22 Ayar';
          updated.urun_kodu = '22_AYAR';
          updated.urun_kategorisi = 'ALTIN';
          updated.milyem = 0.9160;
        }
      }

      // Detay manuel değişirse
      if (field === 'islem_detayi') {
        if (value.includes('Nakit') || value.includes('Banka') || value.includes('Havale')) {
          updated.urun = 'Nakit';
          updated.urun_kodu = 'NAKIT_TL';
          updated.urun_kategorisi = 'NAKIT';
          updated.milyem = 0;
          updated.has_altin = '';
          updated.brut = '';
          updated.adet = 1;
        } else if (updated.urun === 'Nakit') {
          updated.urun = '22 Ayar';
          updated.urun_kodu = '22_AYAR';
          updated.urun_kategorisi = 'ALTIN';
          updated.milyem = 0.9160;
        }
      }

      // Adet değiştiyse (Sadece Sarrafiye için has hesapla)
      if (field === 'adet' && updated.urun_kategorisi === 'SARRAFIYE') {
        const a = parseFloat(value) || 0;
        updated.has_altin = (a * updated.has_karsiligi).toFixed(3);
      }

      // Brüt veya Milyem değiştiyse Has Altın hesapla
      if ((field === 'brut' || field === 'milyem') && updated.urun_kategorisi !== 'SARRAFIYE' && updated.urun_kategorisi !== 'NAKIT' && updated.urun_kategorisi !== 'PIRLANTA') {
        const parsedBrut = field === 'brut' ? parseTrNumber(value) : parseTrNumber(updated.brut);
        const b = parsedBrut !== null ? parsedBrut : 0;
        const m = parseFloat(updated.milyem) || 0;
        updated.has_altin = (b * m).toFixed(3);
      }

      // Para birimi veya döviz alanları değişirse TL Tutar hesapla
      if (field === 'para_birimi') {
        if (value === 'TRY') {
          updated.doviz_tutar = '';
          updated.doviz_kuru = '';
        } else {
          // Varsayılan kurları prefill et
          if (value === 'USD') {
            updated.doviz_kuru = kurlar?.usd_try ? kurlar.usd_try.toString() : '';
          } else if (value === 'EUR') {
            updated.doviz_kuru = kurlar?.eur_try ? kurlar.eur_try.toString() : '';
          }
          const dt = parseTrNumber(updated.doviz_tutar) || 0;
          const dk = parseTrNumber(updated.doviz_kuru) || 0;
          updated.tl_tutar = dt && dk ? (dt * dk).toFixed(2) : '';
        }
      }

      if (field === 'doviz_tutar' || field === 'doviz_kuru') {
        const dt = parseTrNumber(updated.doviz_tutar) || 0;
        const dk = parseTrNumber(updated.doviz_kuru) || 0;
        updated.tl_tutar = dt && dk ? (dt * dk).toFixed(2) : '';
      }

      return updated;
    }));
  };

  const handleInputKeyDown = (e, index, field) => {
    // Son sütunun son satırında Tab'a basınca otomatik yeni satır aç
    if (e.key === 'Tab' && !e.shiftKey && index === kalemler.length - 1 && field === 'tl_tutar') {
      e.preventDefault();
      handleYeniSatir();
      return;
    }
    
    // Enter tuşuna basınca bir sonraki yazılabilir hücreye geç
    if (e.key === 'Enter') {
      e.preventDefault();
      const focusables = Array.from(
        document.querySelectorAll('.modal-grid-table select:not([disabled]), .modal-grid-table input:not([disabled]), .modal-grid-table button:not([disabled])')
      );
      const currentIndex = focusables.indexOf(e.target);
      if (currentIndex > -1 && currentIndex < focusables.length - 1) {
        focusables[currentIndex + 1].focus();
      } else {
        // En son hücredeyse ve Enter yaparsa doğrudan fişi kaydet
        handleCokluKaydet();
      }
    }
  };

  const handleCokluKaydet = async () => {
    const gecerliKalemler = kalemler.filter(k => (parseTrNumber(k.has_altin) || 0) > 0 || (parseTrNumber(k.tl_tutar) || 0) > 0);
    if (gecerliKalemler.length === 0) return;

    try {
      const payloadKalemler = gecerliKalemler.map(k => {
        let ekDetay = '';
        if (k.urun !== "Nakit") {
          ekDetay += ` (${k.urun})`;
          if (k.urun_kategorisi === 'SARRAFIYE' && (parseTrNumber(k.adet) || 0) > 0) {
            ekDetay += ` [${k.adet} Adet]`;
          } else if ((parseTrNumber(k.brut) || 0) > 0) {
            ekDetay += ` [Brüt: ${k.brut}gr | Mylm: ${k.milyem}]`;
          }
        }
        
        if (k.para_birimi && k.para_birimi !== 'TRY') {
          ekDetay += ` [${k.doviz_tutar} ${k.para_birimi} @ ${k.doviz_kuru}]`;
        }
        
        const isNakit = k.urun_kategorisi === 'NAKIT';
        const isUSD = k.para_birimi === 'USD';
        const isEUR = k.para_birimi === 'EUR';

        let tlVal = 0;
        let usdVal = 0;
        let eurVal = 0;

        if (isNakit) {
          if (isUSD) {
            usdVal = parseTrNumber(k.doviz_tutar) || 0;
          } else if (isEUR) {
            eurVal = parseTrNumber(k.doviz_tutar) || 0;
          } else {
            tlVal = parseTrNumber(k.tl_tutar) || 0;
          }
        } else {
          tlVal = parseTrNumber(k.tl_tutar) || 0;
        }

        return {
          islem_tipi: k.islem_tipi,
          islem_detayi: k.islem_detayi + ekDetay,
          has_altin: parseTrNumber(k.has_altin) || 0,
          tl_tutar: tlVal,
          usd_tutar: usdVal,
          eur_tutar: eurVal
        };
      });

      const res = await fetch(`${API_BASE}/toptancilar/${id}/coklu_islemler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aciklama: faturaNotu,
          kalemler: payloadKalemler
        })
      });
      
      if (res.ok) {
        setModalAcik(false);
        setKalemler([createEmptyRow()]);
        setFaturaNotu('');
        fetchDetay();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleIslemSil = async (islemId, e) => {
    e.stopPropagation(); // Satır tıklamasını tetiklemesin
    if (!window.confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`${API_BASE}/toptanci_islemler/${islemId}`, { method: 'DELETE' });
      if (res.ok) fetchDetay();
    } catch (err) {
      console.error(err);
    }
  };

  // İşlem detayındaki ek detayları ayrıştırıp estetik gösteren yardımcılar
  const parseIslemDetayi = (detayi) => {
    const productMatch = detayi.match(/\(([^)]+)\)/);
    const urunTuru = productMatch ? productMatch[1] : null;
    const temizBaslik = detayi.replace(/\s*\([^)]+\)/g, '').split(' [')[0];
    return { temizBaslik, urunTuru };
  };

  const getIslemIcon = (baslik) => {
    const b = baslik.toLowerCase();
    if (b.includes('nakit') || b.includes('banka') || b.includes('havale')) return '💸';
    if (b.includes('hurda') || b.includes('has altın') || b.includes('mal alış')) return '✨';
    if (b.includes('fiks') || b.includes('kur kesme')) return '📈';
    return '📝';
  };

  const parseTeknikDetay = (detayStr) => {
    if (!detayStr) return null;
    const cleaned = detayStr.replace('[', '').replace(']', '');
    
    if (cleaned.includes('|')) {
      const parts = cleaned.split('|').map(p => p.trim());
      const brutVal = parts[0].replace('Brüt:', '').trim();
      const milyemVal = parts[1].replace('Mylm:', '').trim();
      return { type: 'weight', brut: brutVal, milyem: milyemVal };
    } else if (cleaned.includes('Adet')) {
      const adetVal = cleaned.replace('Adet', '').trim();
      return { type: 'count', adet: adetVal };
    }
    
    return { type: 'text', text: cleaned };
  };

  if (loading) return <div className="p-6 text-center text-ink-500 font-bold">Yükleniyor...</div>;
  if (!data.toptanci) return null;

  const t = data.toptanci;

  // Taslak Fatura Toplamları
  const totalHas = kalemler.reduce((acc, k) => {
    const val = parseTrNumber(k.has_altin) || 0;
    return k.islem_tipi === 'Borçlanma' ? acc + val : acc - val;
  }, 0);

  const totalTl = kalemler.reduce((acc, k) => {
    const val = parseTrNumber(k.tl_tutar) || 0;
    return k.islem_tipi === 'Borçlanma' ? acc + val : acc - val;
  }, 0);



  // Ürün Seçici Tablo Filtreleri
  const filtrelenmisUrunler = [
    NAKIT_SANAL_URUN,
    ...urunlerListesi.filter(u => u.aktif)
  ].filter(u => {
    if (urunSeciciKategori !== 'HEPSİ') {
      if (u.urun_kategorisi !== urunSeciciKategori) return false;
    }
    if (urunAramaSorgusu) {
      const q = urunAramaSorgusu.toLowerCase();
      return u.ad.toLowerCase().includes(q) || 
             u.urun_cinsi.toLowerCase().includes(q) || 
             (u.urun_grubu && u.urun_grubu.toLowerCase().includes(q));
    }
    return true;
  });

  // Fiksleme Panel Dynamic Labels, Signs and Colors
  let fiksGoldLabel = '';
  let fiksGoldValueSign = '';
  let fiksGoldColorClass = '';

  let fiksTlLabel = '';
  let fiksTlValueSign = '';
  let fiksTlColorClass = '';

  const fiksMiktarNum = parseFloat(fikslemeMiktar) || 0;
  const fiksTutarNum = parseFloat(fikslemeTutar) || 0;
  const fiksKurNum = parseFloat(fikslemeDovizKuru) || 1;
  const fiksTlValue = fikslemeParaBirimi === 'TRY' ? fiksTutarNum : fiksTutarNum * fiksKurNum;
  
  if (fikslemeYonu === 'PARA_TO_PARA') {
      const isSourceDebt = fikslemeParaBirimi === 'TRY' ? ((t?.bakiye_tl ?? 0) >= 0) : fikslemeParaBirimi === 'USD' ? ((t?.bakiye_usd ?? 0) >= 0) : ((t?.bakiye_eur ?? 0) >= 0);
      const islem1 = createEmptyRow();
      islem1.islem_tipi = isSourceDebt ? 'Ödeme' : 'Borçlanma';
      islem1.islem_detayi = "Döviz Çevrimi (Kaynak)";
      islem1.urun = 'Nakit';
      islem1.urun_kodu = fikslemeParaBirimi;
      islem1.urun_kategorisi = 'NAKIT';
      islem1.tl_tutar = fiksMiktarNum;
      islem1.para_birimi = fikslemeParaBirimi;
      islem1.doviz_tutar = fikslemeParaBirimi !== 'TRY' ? fiksMiktarNum : '';
      islem1.doviz_kuru = fiksKurNum;
      
      const islem2 = createEmptyRow();
      islem2.islem_tipi = isSourceDebt ? 'Borçlanma' : 'Ödeme';
      islem2.islem_detayi = "Döviz Çevrimi (Hedef)";
      islem2.urun = 'Nakit';
      islem2.urun_kodu = fikslemeHedefParaBirimi;
      islem2.urun_kategorisi = 'NAKIT';
      islem2.tl_tutar = fiksTutarNum;
      islem2.para_birimi = fikslemeHedefParaBirimi;
      islem2.doviz_tutar = fikslemeHedefParaBirimi !== 'TRY' ? fiksTutarNum : '';
      islem2.doviz_kuru = parseFloat(fikslemeGramFiyat) || 1; // parite
      
      const temizKalemler = kalemler.filter(k => (parseTrNumber(k.has_altin) || 0) > 0 || (parseTrNumber(k.tl_tutar) || 0) > 0);
      setKalemler([...temizKalemler, islem1, islem2]);
      setFikslemePanelAcik(false);
      return;
  }

  if (fikslemeYonu === 'ALTIN_TO_PARA') {
    // Converting Gold to Cash
    if ((t?.bakiye_has ?? 0) >= 0) {
      fiksGoldLabel = 'Altın Borç Azalışı:';
      fiksGoldValueSign = '-';
      fiksGoldColorClass = 'text-emerald-700';

      fiksTlLabel = 'TL Borç Artışı:';
      fiksTlValueSign = '+';
      fiksTlColorClass = 'text-rose-700';
    } else {
      fiksGoldLabel = 'Altın Alacak Azalışı:';
      fiksGoldValueSign = '-';
      fiksGoldColorClass = 'text-rose-700';

      fiksTlLabel = 'TL Alacak Artışı:';
      fiksTlValueSign = '+';
      fiksTlColorClass = 'text-emerald-700';
    }
  } else {
    // Converting Cash to Gold
    if ((t?.bakiye_tl ?? 0) >= 0) {
      fiksTlLabel = 'TL Borç Azalışı:';
      fiksTlValueSign = '-';
      fiksTlColorClass = 'text-emerald-700';

      fiksGoldLabel = 'Altın Borç Artışı:';
      fiksGoldValueSign = '+';
      fiksGoldColorClass = 'text-rose-700';
    } else {
      fiksTlLabel = 'TL Alacak Azalışı:';
      fiksTlValueSign = '-';
      fiksTlColorClass = 'text-rose-700';

      fiksGoldLabel = 'Altın Alacak Artışı:';
      fiksGoldValueSign = '+';
      fiksGoldColorClass = 'text-emerald-700';
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="animate-fadeIn">
        {/* Üst Başlık */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/toptancilar" className="p-2 bg-white border border-ink-150 text-ink-500 hover:text-ink-900 transition-colors shadow-sm">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-ink-900 tracking-tight">
              {t.unvan}
            </h1>
            <p className="text-xs text-ink-400 mt-0.5">Toptancı Hesap Detayı & Cari Ekstresi</p>
          </div>
        </div>
        
        {/* Görünüm Değiştirici Butonlar */}
        <div className="flex items-center gap-1.5 bg-ink-100 p-1 border border-ink-200">
          <button
            onClick={() => setDefterGorunumu(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all ${
              defterGorunumu
                ? 'bg-white text-ink-900 shadow-sm border border-ink-200'
                : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            <BookOpen size={14} /> Çift Sütun Klasik Defter
          </button>
          <button
            onClick={() => setDefterGorunumu(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all ${
              !defterGorunumu
                ? 'bg-white text-ink-900 shadow-sm border border-ink-200'
                : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            <Clock size={14} /> Kronolojik Akış
          </button>
        </div>
      </div>

      {/* Bakiyeler */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${t.bakiye_usd !== 0 && t.bakiye_eur !== 0 ? "lg:grid-cols-4" : (t.bakiye_usd !== 0 || t.bakiye_eur !== 0 ? "lg:grid-cols-3" : "lg:grid-cols-2")} gap-6 mb-8`}>
        <div className="relative bg-white border-l-4 border-l-gold-500 border border-ink-150 premium-shadow p-6 flex flex-col justify-center overflow-hidden group hover:border-l-gold-600 transition-all duration-300">
          <div className="absolute right-4 bottom-2 text-ink-100 opacity-20 pointer-events-none select-none group-hover:scale-110 transition-transform duration-300">
            <Calculator size={96} strokeWidth={1} />
          </div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-ink-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>✨</span> HAS ALTIN BAKİYESİ
            </h3>
            {t.bakiye_has > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-rose-600 font-bold text-[10px] bg-rose-50 px-2 py-0.5 border border-rose-100">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span> BORCUNUZ VAR
              </span>
            ) : t.bakiye_has < 0 ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ALACAĞINIZ VAR
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-ink-400 font-bold text-[10px] bg-ink-50 px-2 py-0.5 border border-ink-100">
                HESAP DENGEDE
              </span>
            )}
          </div>
          <p className={`font-mono text-4xl font-black tracking-tight ${t.bakiye_has > 0 ? 'text-rose-600' : t.bakiye_has < 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
            {Math.abs(t.bakiye_has).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-sans font-bold text-ink-500">gr</span>
          </p>
          <div className="mt-2 text-xs text-ink-400">
            {t.bakiye_has > 0 ? 'Toptancıya teslim etmeniz gereken net altın miktarı.' : t.bakiye_has < 0 ? 'Toptancıdan almanız gereken net altın miktarı.' : 'Altın hesabı dengelenmiş durumda.'}
          </div>
        </div>

        <div className="relative bg-white border-l-4 border-l-emerald-500 border border-ink-150 premium-shadow p-6 flex flex-col justify-center overflow-hidden group hover:border-l-emerald-600 transition-all duration-300">
          <div className="absolute right-4 bottom-2 text-ink-100 opacity-20 pointer-events-none select-none group-hover:scale-110 transition-transform duration-300">
            <span className="text-8xl font-black font-mono text-ink-200">₺</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-ink-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>💸</span> TL PARA BAKİYESİ
            </h3>
            {t.bakiye_tl > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-rose-600 font-bold text-[10px] bg-rose-50 px-2 py-0.5 border border-rose-100">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span> BORCUNUZ VAR
              </span>
            ) : t.bakiye_tl < 0 ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ALACAĞINIZ VAR
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-ink-400 font-bold text-[10px] bg-ink-50 px-2 py-0.5 border border-ink-100">
                HESAP DENGEDE
              </span>
            )}
          </div>
          <p className={`font-mono text-4xl font-black tracking-tight ${t.bakiye_tl > 0 ? 'text-rose-600' : t.bakiye_tl < 0 ? 'text-emerald-600' : 'text-ink-900'}`}>
            {Math.abs(t.bakiye_tl).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-lg font-sans font-bold text-ink-500">₺</span>
          </p>
          <div className="mt-2 text-xs text-ink-400">
            {t.bakiye_tl > 0 ? 'Toptancıya ödemeniz gereken Türk Lirası tutarı.' : t.bakiye_tl < 0 ? 'Toptancıdan tahsil etmeniz gereken Türk Lirası tutarı.' : 'TL hesabı dengelenmiş durumda.'}
          </div>
        </div>

        {t.bakiye_usd !== 0 && (
          <div className="relative bg-white border-l-4 border-l-blue-500 border border-ink-150 premium-shadow p-6 flex flex-col justify-center overflow-hidden group hover:border-l-blue-600 transition-all duration-300">
            <div className="absolute right-4 bottom-2 text-ink-100 opacity-20 pointer-events-none select-none group-hover:scale-110 transition-transform duration-300">
              <span className="text-8xl font-black font-mono text-ink-200">$</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-ink-400 uppercase tracking-widest flex items-center gap-1.5">
                <span>💵</span> USD PARA BAKİYESİ
              </h3>
              {t.bakiye_usd > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-rose-600 font-bold text-[10px] bg-rose-50 px-2 py-0.5 border border-rose-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span> BORCUNUZ VAR
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ALACAĞINIZ VAR
                </span>
              )}
            </div>
            <p className={`font-mono text-4xl font-black tracking-tight ${t.bakiye_usd > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {Math.abs(t.bakiye_usd).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-lg font-sans font-bold text-ink-500">$</span>
            </p>
            <div className="mt-2 text-xs text-ink-400">
              {t.bakiye_usd > 0 ? 'Toptancıya ödemeniz gereken Amerikan Doları tutarı.' : 'Toptancıdan tahsil etmeniz gereken Amerikan Doları tutarı.'}
            </div>
          </div>
        )}

        {t.bakiye_eur !== 0 && (
          <div className="relative bg-white border-l-4 border-l-amber-500 border border-ink-150 premium-shadow p-6 flex flex-col justify-center overflow-hidden group hover:border-l-amber-600 transition-all duration-300">
            <div className="absolute right-4 bottom-2 text-ink-100 opacity-20 pointer-events-none select-none group-hover:scale-110 transition-transform duration-300">
              <span className="text-8xl font-black font-mono text-ink-200">€</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-ink-400 uppercase tracking-widest flex items-center gap-1.5">
                <span>💶</span> EUR PARA BAKİYESİ
              </h3>
              {t.bakiye_eur > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-rose-600 font-bold text-[10px] bg-rose-50 px-2 py-0.5 border border-rose-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span> BORCUNUZ VAR
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ALACAĞINIZ VAR
                </span>
              )}
            </div>
            <p className={`font-mono text-4xl font-black tracking-tight ${t.bakiye_eur > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {Math.abs(t.bakiye_eur).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-lg font-sans font-bold text-ink-500">€</span>
            </p>
            <div className="mt-2 text-xs text-ink-400">
              {t.bakiye_eur > 0 ? 'Toptancıya ödemeniz gereken Euro tutarı.' : 'Toptancıdan tahsil etmeniz gereken Euro tutarı.'}
            </div>
          </div>
        )}
      </div>

      {/* Kontrol ve Filtreleme Başlık Alanı */}
      <div className="bg-white p-4 border border-ink-150 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-sm font-bold text-ink-900">Defter Kayıtları ve Hareketler</h2>
          <p className="text-xs text-ink-400 mt-0.5">Toptancıya ait geçmiş işlem ekstreleri.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Arama: İşlem, tarih veya not..."
              className="w-full bg-ink-50 border border-ink-200 pl-8 pr-3 py-2 text-xs font-semibold text-ink-900 outline-none focus:border-gold-500"
              value={arama}
              onChange={e => setArama(e.target.value)}
            />
            <span className="absolute left-2.5 top-2.5 text-ink-400">
              <Search size={14} />
            </span>
          </div>
          <button
            onClick={() => setModalAcik(true)}
            className="flex items-center gap-2 bg-ink-900 hover:bg-gold-500 text-white px-5 py-2.5 text-xs font-bold transition-all active:scale-95 whitespace-nowrap shadow-md shadow-ink-900/10"
          >
            <Calculator size={14} /> Yeni İşlem Gir
          </button>
        </div>
      </div>

      {/* Tarih Filtreleme ve PDF İndirme Barı */}
      <div className="bg-white px-4 py-3 border border-ink-150 border-t-0 -mt-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'total', label: 'Tüm Zamanlar' },
            { key: 'today', label: 'Bugün' },
            { key: 'week', label: 'Son 7 Gün' },
            { key: 'month', label: 'Son 30 Gün' },
            { key: 'custom', label: 'Özel Tarih' }
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setActivePeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-bold transition-all ${
                activePeriod === p.key
                  ? 'bg-gold-500 text-white shadow-sm shadow-gold-500/10'
                  : 'bg-ink-50 hover:bg-ink-100 text-ink-700'
              }`}
            >
              {p.label}
            </button>
          ))}

          {activePeriod === 'custom' && (
            <div className="flex items-center gap-2 ml-2 transition-all">
              <input
                type="date"
                className="bg-ink-50 border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-900 outline-none focus:border-gold-500"
                value={customRange.start}
                onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
              />
              <span className="text-xs text-ink-400 font-bold">➔</span>
              <input
                type="date"
                className="bg-ink-50 border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-900 outline-none focus:border-gold-500"
                value={customRange.end}
                onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          )}
        </div>

        <button
          onClick={handlePdfDownload}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-black tracking-wide transition-all active:scale-95 shadow-md shadow-rose-600/10 self-stretch md:self-auto justify-center"
        >
          <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24">
            <path d="M12 16l-4-4h3V4h2v8h3l-4 4zm9-4v6H3v-6H1v6c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-6h-2z"/>
          </svg>
          PDF EKSTRE İNDİR
        </button>
      </div>

      {/* ─── GÖRÜNÜM 1: ÇİFT SÜTUN KLASİK KUYUMCU DEFTERİ (T-ACCOUNT) ─── */}
      {defterGorunumu ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* SOL SAYFA: ALINANLAR / BORÇLANMA */}
          <div className="bg-white border border-rose-150 premium-shadow">
            <div className="px-4 py-3 bg-rose-50/50 border-b border-rose-150 flex justify-between items-center">
              <span className="text-xs font-black text-rose-800 tracking-wider flex items-center gap-1.5">
                🔻 ALINANLAR / BORÇ SAYFASI
              </span>
              <span className="text-[10px] font-mono text-rose-600 bg-rose-50 px-2 py-0.5 border border-rose-200 font-bold">
                Toptancıdan Gelenler
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-ink-50 border-b border-ink-150">
                    <th className="px-3 py-3 w-8"></th>
                    <th className="px-3 py-3">Tarih</th>
                    <th className="px-3 py-3">İşlem & Detay</th>
                    <th className="px-3 py-3 text-right">Has Altın</th>
                    <th className="px-3 py-3 text-right">TL Tutar</th>
                    <th className="px-2 py-3 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {groupedSolSayfa.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-ink-400 italic">Alınan/borç kaydı bulunmuyor.</td>
                    </tr>
                  ) : (
                    groupedSolSayfa.map((group) => {
                      const isDateExpanded = expandedDates[group.date] ?? (group.date === todayStr);
                      return (
                        <React.Fragment key={group.date}>
                          {/* Tarih Grubu Başlığı */}
                          <tr 
                            onClick={() => toggleDate(group.date)}
                            className="bg-rose-50/10 hover:bg-rose-50/30 cursor-pointer transition-colors border-y border-rose-100/50"
                          >
                            <td colSpan={6} className="px-3 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-rose-700">
                                    {isDateExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </span>
                                  <span className="text-xs font-black text-rose-900">
                                    {formatHeaderDate(group.date, todayStr)}
                                  </span>
                                  <span className="px-2 py-0.2 text-[9px] font-bold bg-rose-100 text-rose-700 rounded-full">
                                    {group.islemler.length} İşlem
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-mono font-black text-rose-700">
                                   <span>{group.hasSum > 0 ? `+${group.hasSum.toFixed(3)} gr` : ''}</span>
                                   <span>{group.tlSum > 0 ? `+${group.tlSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` : ''}</span>
                                   {group.usdSum > 0 && <span>{`+${group.usdSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $`}</span>}
                                   {group.eurSum > 0 && <span>{`+${group.eurSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €`}</span>}
                                 </div>
                              </div>
                            </td>
                          </tr>

                          {/* O Güne Ait İşlemler */}
                          {isDateExpanded && group.islemler.map((islem) => {
                            const { temizBaslik, urunTuru } = parseIslemDetayi(islem.islem_detayi);
                            const icon = getIslemIcon(temizBaslik);
                            const isExpanded = expandedRowId === islem.id;
                            const parts = islem.islem_detayi.split(' [');
                            const gizliTeknikDetay = parts.length > 1 ? `[${parts[1]}` : null;
                            const dateObj = new Date(islem.islem_tarihi);
                            const timeStr = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

                            return (
                              <React.Fragment key={islem.id}>
                                <tr 
                                  onClick={() => setExpandedRowId(isExpanded ? null : islem.id)}
                                  className={`hover:bg-rose-50/5 transition-colors cursor-pointer ${isExpanded ? 'bg-rose-50/10' : ''}`}
                                >
                                  <td className="px-3 py-2.5 text-ink-400">
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </td>
                                  <td className="px-3 py-2.5 text-[10px] font-mono text-ink-500 whitespace-nowrap">
                                    {timeStr}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span>{icon}</span>
                                      <div>
                                        <div className="font-bold text-ink-900 leading-tight">{temizBaslik}</div>
                                        {urunTuru && (
                                          <span className="inline-block mt-0.5 px-1 py-0.2 text-[8px] font-black bg-gold-50 text-gold-800 border border-gold-200 uppercase tracking-wide">
                                            {urunTuru}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-black text-rose-600 whitespace-nowrap">
                                    {islem.has_altin > 0 ? `+${islem.has_altin.toFixed(3)}` : '—'}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-black text-rose-600 whitespace-nowrap">
                                    {islem.tl_tutar > 0 ? (
                                      `+${islem.tl_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
                                    ) : islem.usd_tutar > 0 ? (
                                      `+${islem.usd_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $`
                                    ) : islem.eur_tutar > 0 ? (
                                      `+${islem.eur_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €`
                                    ) : '—'}
                                  </td>
                                  <td className="px-2 py-2.5 text-center">
                                    <button 
                                      onClick={(e) => handleIslemSil(islem.id, e)} 
                                      className="p-1 text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-full"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                                
                                {/* Detay Kartı */}
                                {isExpanded && (
                                  <tr className="bg-rose-50/5 border-b border-rose-100">
                                    <td colSpan={6} className="px-8 py-3 bg-ink-50/30">
                                      <div className="space-y-2">
                                        {islem.aciklama && <p className="text-xs text-ink-600"><span className="font-bold text-ink-400">Açıklama:</span> {islem.aciklama}</p>}
                                        {gizliTeknikDetay && (
                                          <p className="text-[10px] font-mono text-gold-800 bg-gold-50/30 p-1.5 border border-gold-200/40 inline-block">
                                            {gizliTeknikDetay.replace('[', '').replace(']', '')}
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Sol Sayfa Toplamı */}
            <div className="p-4 bg-rose-50/20 border-t border-rose-150 flex flex-wrap justify-between items-center gap-2 text-xs">
              <span className="font-bold text-rose-800">SOL SAYFA TOPLAMI:</span>
              <div className="flex flex-wrap gap-4 font-mono font-black text-rose-700">
                <span>{solHasSum.toFixed(3)} gr Has</span>
                <span>{solTlSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                {solUsdSum > 0 && <span>{solUsdSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $</span>}
                {solEurSum > 0 && <span>{solEurSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €</span>}
              </div>
            </div>
          </div>

          {/* SAĞ SAYFA: VERİLENLER / ÖDEMELER */}
          <div className="bg-white border border-emerald-150 premium-shadow">
            <div className="px-4 py-3 bg-emerald-50/50 border-b border-emerald-150 flex justify-between items-center">
              <span className="text-xs font-black text-emerald-800 tracking-wider flex items-center gap-1.5">
                🔺 VERİLENLER / ÖDEME SAYFASI
              </span>
              <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 border border-emerald-200 font-bold">
                Bizim Ödediklerimiz / Verdiklerimiz
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-ink-50 border-b border-ink-150">
                    <th className="px-3 py-3 w-8"></th>
                    <th className="px-3 py-3">Tarih</th>
                    <th className="px-3 py-3">İşlem & Detay</th>
                    <th className="px-3 py-3 text-right">Has Altın</th>
                    <th className="px-3 py-3 text-right">Tutar</th>
                    <th className="px-2 py-3 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {groupedSagSayfa.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-ink-400 italic">Yapılan ödeme/teslimat kaydı bulunmuyor.</td>
                    </tr>
                  ) : (
                    groupedSagSayfa.map((group) => {
                      const isDateExpanded = expandedDates[group.date] ?? (group.date === todayStr);
                      return (
                        <React.Fragment key={group.date}>
                          {/* Tarih Grubu Başlığı */}
                          <tr 
                            onClick={() => toggleDate(group.date)}
                            className="bg-emerald-50/10 hover:bg-emerald-50/30 cursor-pointer transition-colors border-y border-emerald-100/50"
                          >
                            <td colSpan={6} className="px-3 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-emerald-700">
                                    {isDateExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </span>
                                  <span className="text-xs font-black text-emerald-900">
                                    {formatHeaderDate(group.date, todayStr)}
                                  </span>
                                  <span className="px-2 py-0.2 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                                    {group.islemler.length} İşlem
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-mono font-black text-emerald-700">
                                   <span>{group.hasSum > 0 ? `-${group.hasSum.toFixed(3)} gr` : ''}</span>
                                   <span>{group.tlSum > 0 ? `-${group.tlSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` : ''}</span>
                                   {group.usdSum > 0 && <span>{`-${group.usdSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $`}</span>}
                                   {group.eurSum > 0 && <span>{`-${group.eurSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €`}</span>}
                                 </div>
                              </div>
                            </td>
                          </tr>

                          {/* O Güne Ait İşlemler */}
                          {isDateExpanded && group.islemler.map((islem) => {
                            const { temizBaslik, urunTuru } = parseIslemDetayi(islem.islem_detayi);
                            const icon = getIslemIcon(temizBaslik);
                            const isExpanded = expandedRowId === islem.id;
                            const parts = islem.islem_detayi.split(' [');
                            const gizliTeknikDetay = parts.length > 1 ? `[${parts[1]}` : null;
                            const dateObj = new Date(islem.islem_tarihi);
                            const timeStr = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

                            return (
                              <React.Fragment key={islem.id}>
                                <tr 
                                  onClick={() => setExpandedRowId(isExpanded ? null : islem.id)}
                                  className={`hover:bg-emerald-50/5 transition-colors cursor-pointer ${isExpanded ? 'bg-emerald-50/10' : ''}`}
                                >
                                  <td className="px-3 py-2.5 text-ink-400">
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </td>
                                  <td className="px-3 py-2.5 text-[10px] font-mono text-ink-500 whitespace-nowrap">
                                    {timeStr}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span>{icon}</span>
                                      <div>
                                        <div className="font-bold text-ink-900 leading-tight">{temizBaslik}</div>
                                        {urunTuru && (
                                          <span className="inline-block mt-0.5 px-1 py-0.2 text-[8px] font-black bg-gold-50 text-gold-800 border border-gold-200 uppercase tracking-wide">
                                            {urunTuru}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-600 whitespace-nowrap">
                                    {islem.has_altin < 0 ? `-${Math.abs(islem.has_altin).toFixed(3)}` : '—'}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-600 whitespace-nowrap">
                                    {islem.tl_tutar < 0 ? (
                                      `-${Math.abs(islem.tl_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
                                    ) : islem.usd_tutar < 0 ? (
                                      `-${Math.abs(islem.usd_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $`
                                    ) : islem.eur_tutar < 0 ? (
                                      `-${Math.abs(islem.eur_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €`
                                    ) : '—'}
                                  </td>
                                  <td className="px-2 py-2.5 text-center">
                                    <button 
                                      onClick={(e) => handleIslemSil(islem.id, e)} 
                                      className="p-1 text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-full"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                                
                                {/* Detay Kartı */}
                                {isExpanded && (
                                  <tr className="bg-emerald-50/5 border-b border-emerald-100">
                                    <td colSpan={6} className="px-8 py-3 bg-ink-50/30">
                                      <div className="space-y-2">
                                        {islem.aciklama && <p className="text-xs text-ink-600"><span className="font-bold text-ink-400">Açıklama:</span> {islem.aciklama}</p>}
                                        {gizliTeknikDetay && (
                                          <p className="text-[10px] font-mono text-gold-800 bg-gold-50/30 p-1.5 border border-gold-200/40 inline-block">
                                            {gizliTeknikDetay.replace('[', '').replace(']', '')}
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Sağ Sayfa Toplamı */}
            <div className="p-4 bg-emerald-50/20 border-t border-emerald-150 flex flex-wrap justify-between items-center gap-2 text-xs">
              <span className="font-bold text-emerald-800">SAĞ SAYFA TOPLAMI:</span>
              <div className="flex flex-wrap gap-4 font-mono font-black text-emerald-700">
                <span>-{sagHasSum.toFixed(3)} gr Has</span>
                <span>-{sagTlSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                {sagUsdSum > 0 && <span>-{sagUsdSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $</span>}
                {sagEurSum > 0 && <span>-{sagEurSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €</span>}
              </div>
            </div>
          </div>
          
          {/* Çift Sütun Net Bakiye Özeti */}
          <div className="lg:col-span-2 bg-ink-900 text-white p-5 border border-ink-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h4 className="text-xs font-bold text-gold-400 uppercase tracking-widest">İKİ TARAFLI HESAP KAPANIKLIĞI</h4>
              <p className="text-[10px] text-ink-300 mt-1">Sol Sayfa (Borç) ve Sağ Sayfanın (Ödeme) net farkıdır.</p>
            </div>
            <div className="flex flex-wrap gap-8">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-ink-400 font-bold uppercase tracking-wide">Net Has Farkı</span>
                <span className={`text-xl font-mono font-black ${(solHasSum - sagHasSum) > 0 ? 'text-rose-400' : (solHasSum - sagHasSum) < 0 ? 'text-emerald-400' : 'text-white'}`}>
                  {((solHasSum - sagHasSum) > 0 ? '+' : '') + (solHasSum - sagHasSum).toFixed(3)} gr
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-ink-400 font-bold uppercase tracking-wide">Net TL Farkı</span>
                <span className={`text-xl font-mono font-black ${(solTlSum - sagTlSum) > 0 ? 'text-rose-400' : (solTlSum - sagTlSum) < 0 ? 'text-emerald-400' : 'text-white'}`}>
                  {((solTlSum - sagTlSum) > 0 ? '+' : '') + (solTlSum - sagTlSum).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
              {(solUsdSum > 0 || sagUsdSum > 0) && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-ink-400 font-bold uppercase tracking-wide">Net USD Farkı</span>
                  <span className={`text-xl font-mono font-black ${(solUsdSum - sagUsdSum) > 0 ? 'text-rose-400' : (solUsdSum - sagUsdSum) < 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {((solUsdSum - sagUsdSum) > 0 ? '+' : '') + (solUsdSum - sagUsdSum).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $
                  </span>
                </div>
              )}
              {(solEurSum > 0 || sagEurSum > 0) && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-ink-400 font-bold uppercase tracking-wide">Net EUR Farkı</span>
                  <span className={`text-xl font-mono font-black ${(solEurSum - sagEurSum) > 0 ? 'text-rose-400' : (solEurSum - sagEurSum) < 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {((solEurSum - sagEurSum) > 0 ? '+' : '') + (solEurSum - sagEurSum).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €
                  </span>
                </div>
              )}
            </div>
          </div>
          
        </div>
      ) : (
        /* ─── GÖRÜNÜM 2: KRONOLOJİK AKIŞ ─── */
        <div className="bg-white border border-ink-150 premium-shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-ink-50 border-b border-ink-150">
                  <th className="px-6 py-4 text-[10px] font-bold text-ink-500 uppercase tracking-wider w-8"></th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ink-500 uppercase tracking-wider">Tarih</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ink-500 uppercase tracking-wider">İşlem Yönü</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ink-500 uppercase tracking-wider">İşlem & Detay</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ink-500 uppercase tracking-wider text-right">Has Altın</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ink-500 uppercase tracking-wider text-right">TL Tutar</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ink-500 uppercase tracking-wider text-center w-12">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {groupedChronological.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-ink-400 text-sm font-medium">Kayıt bulunamadı.</td>
                  </tr>
                ) : (
                  groupedChronological.map((group) => {
                    const isDateExpanded = expandedDates[group.date] ?? (group.date === todayStr);
                    return (
                      <React.Fragment key={group.date}>
                        {/* Tarih Grubu Başlığı */}
                        <tr 
                          onClick={() => toggleDate(group.date)}
                          className="bg-ink-50/60 hover:bg-ink-100/80 cursor-pointer transition-colors border-y border-ink-200 select-none"
                        >
                          <td colSpan={7} className="px-6 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-ink-500">
                                  {isDateExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </span>
                                <span className="text-sm font-black text-ink-800">
                                  {formatHeaderDate(group.date, todayStr)}
                                </span>
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-ink-200 text-ink-700 rounded-full">
                                  {group.islemler.length} İşlem
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-mono font-bold">
                                <span className={group.hasNet > 0 ? 'text-rose-600' : group.hasNet < 0 ? 'text-emerald-600' : 'text-ink-500'}>
                                  Net Has: {group.hasNet > 0 ? '+' : ''}{group.hasNet.toFixed(3)} gr
                                </span>
                                <span className={group.tlNet > 0 ? 'text-rose-600' : group.tlNet < 0 ? 'text-emerald-600' : 'text-ink-500'}>
                                  Net TL: {group.tlNet > 0 ? '+' : ''}{group.tlNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                </span>
                                {group.usdNet !== 0 && (
                                  <span className={group.usdNet > 0 ? 'text-rose-600' : group.usdNet < 0 ? 'text-emerald-600' : 'text-ink-500'}>
                                    Net USD: {group.usdNet > 0 ? '+' : ''}{group.usdNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} $
                                  </span>
                                )}
                                {group.eurNet !== 0 && (
                                  <span className={group.eurNet > 0 ? 'text-rose-600' : group.eurNet < 0 ? 'text-emerald-600' : 'text-ink-500'}>
                                    Net EUR: {group.eurNet > 0 ? '+' : ''}{group.eurNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* O Güne Ait İşlemler */}
                        {isDateExpanded && group.islemler.map((islem) => {
                          const { temizBaslik, urunTuru } = parseIslemDetayi(islem.islem_detayi);
                          const icon = getIslemIcon(temizBaslik);
                          const parts = islem.islem_detayi.split(' [');
                          const gizliTeknikDetay = parts.length > 1 ? `[${parts[1]}` : null;
                          const isExpanded = expandedRowId === islem.id;
                          const isBorc = islem.islem_tipi === 'Borçlanma';
                          const dateObj = new Date(islem.islem_tarihi);
                          const timeStr = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

                          return (
                            <React.Fragment key={islem.id}>
                              <tr 
                                onClick={() => setExpandedRowId(isExpanded ? null : islem.id)}
                                className={`hover:bg-ink-50/30 transition-colors cursor-pointer ${isExpanded ? 'bg-ink-50/50' : ''}`}
                              >
                                <td className="px-6 py-4 text-ink-400">
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-ink-800 font-mono">
                                  {timeStr}
                                </td>
                                <td className="px-6 py-4">
                                  {isBorc ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                                      🔻 Borç / Alış
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      🔺 Ödeme / Teslim
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base select-none">{icon}</span>
                                    <div>
                                      <div className="text-sm font-bold text-ink-900">{temizBaslik}</div>
                                      {urunTuru && (
                                        <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold bg-gold-50 text-gold-700 border border-gold-200 uppercase tracking-wide">
                                          {urunTuru}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {islem.has_altin > 0 ? (
                                    <span className={`font-mono font-bold text-sm ${isBorc ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {isBorc ? '+' : '-'}{islem.has_altin.toFixed(3)} <span className="text-[10px] text-ink-400 font-sans">gr</span>
                                    </span>
                                  ) : (
                                    <span className="font-mono text-xs text-ink-300">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {islem.tl_tutar > 0 ? (
                                    <span className={`font-mono font-bold text-sm ${isBorc ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {isBorc ? '+' : '-'}{islem.tl_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-[10px] text-ink-400 font-sans">₺</span>
                                    </span>
                                  ) : islem.usd_tutar > 0 ? (
                                    <span className={`font-mono font-bold text-sm ${isBorc ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {isBorc ? '+' : '-'}{islem.usd_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-[10px] text-ink-400 font-sans">$</span>
                                    </span>
                                  ) : islem.eur_tutar > 0 ? (
                                    <span className={`font-mono font-bold text-sm ${isBorc ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {isBorc ? '+' : '-'}{islem.eur_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-[10px] text-ink-400 font-sans">€</span>
                                    </span>
                                  ) : (
                                    <span className="font-mono text-xs text-ink-300">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button 
                                    onClick={(e) => handleIslemSil(islem.id, e)} 
                                    className="p-2 text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-full"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                              
                              {/* Accordion Gizli Detay Satırı */}
                              {isExpanded && (
                                <tr className="bg-ink-50/40 border-b border-ink-150 animate-fadeIn">
                                  <td colSpan={7} className="px-14 py-4">
                                    <div className="flex flex-col md:flex-row gap-6 justify-between items-stretch">
                                      <div className="flex-1 space-y-1.5">
                                        <div className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">İşlem Açıklaması / Fiş Notu</div>
                                        {islem.aciklama ? (
                                          <div className="text-xs text-ink-800 font-semibold bg-white p-3 border border-ink-150 shadow-sm leading-relaxed min-h-[50px] flex items-center">
                                            {islem.aciklama}
                                          </div>
                                        ) : (
                                          <div className="text-xs text-ink-400 italic bg-ink-50/20 p-3 border border-dashed border-ink-200 min-h-[50px] flex items-center">
                                            Bu işlem için herhangi bir açıklama veya fatura notu girilmemiş.
                                          </div>
                                        )}
                                      </div>
                                      
                                      {gizliTeknikDetay && (
                                        <div className="w-full md:w-80 space-y-1.5">
                                          <div className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Altın Detay Bilgileri</div>
                                          <div className="bg-gold-50/30 border border-gold-200/60 p-3 shadow-sm text-xs font-mono">
                                            {(() => {
                                              const detayBilgisi = parseTeknikDetay(gizliTeknikDetay);
                                              if (!detayBilgisi) return null;
                                              return (
                                                <>
                                                  {detayBilgisi.type === 'weight' && (
                                                    <div className="space-y-1">
                                                      <div className="flex justify-between py-1 border-b border-gold-200/10">
                                                        <span className="text-gold-700 font-medium">Kayıt Türü:</span>
                                                        <span className="font-bold text-gold-900">Gram Altın Tartımı</span>
                                                      </div>
                                                      <div className="flex justify-between py-1 border-b border-gold-200/10">
                                                        <span className="text-gold-700 font-medium">Brüt Ağırlık:</span>
                                                        <span className="font-bold text-ink-900">{detayBilgisi.brut}</span>
                                                      </div>
                                                      <div className="flex justify-between py-1">
                                                        <span className="text-gold-700 font-medium">Milyem (Mlym):</span>
                                                        <span className="font-bold text-ink-900">{detayBilgisi.milyem}</span>
                                                      </div>
                                                    </div>
                                                  )}
                                                  {detayBilgisi.type === 'count' && (
                                                    <div className="space-y-1">
                                                      <div className="flex justify-between py-1 border-b border-gold-200/10">
                                                        <span className="text-gold-700 font-medium">Kayıt Türü:</span>
                                                        <span className="font-bold text-gold-900">Sarrafiye Adet</span>
                                                      </div>
                                                      <div className="flex justify-between py-1">
                                                        <span className="text-gold-700 font-medium">Toplam Adet:</span>
                                                        <span className="font-bold text-ink-900">{detayBilgisi.adet} Adet</span>
                                                      </div>
                                                    </div>
                                                  )}
                                                  {detayBilgisi.type === 'text' && (
                                                    <div className="space-y-1">
                                                      <div className="flex justify-between py-1">
                                                        <span className="text-gold-700 font-medium">Kayıt Detayı:</span>
                                                        <span className="font-bold text-ink-900">{detayBilgisi.text}</span>
                                                      </div>
                                                    </div>
                                                  )}
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* DYNAMIC SPREADSHEET MULTI-ENTRY MODAL */}
      {modalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-6xl border border-ink-200 shadow-2xl flex flex-col max-h-[90vh] animate-fadeIn relative">
            
            {/* Top Gold Accent Line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-700"></div>

            {/* Header */}
            <div className="p-6 border-b border-ink-150 bg-white flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-ink-900 flex items-center gap-2">
                  <Calculator className="text-gold-500" /> Çoklu Hesap Fişi Girişi
                </h2>
                <p className="text-xs text-ink-400 mt-0.5">Hızlı veri girişi için klavye odaklı akıllı cari fiş ekranı.</p>
              </div>
              <button 
                onClick={() => setModalAcik(false)}
                className="p-1.5 hover:bg-ink-100 text-ink-400 hover:text-ink-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Draft Summary Info Bar */}
            <div className="px-6 py-3 bg-ink-50 border-b border-ink-150 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-ink-500 font-semibold">Toptancı: <strong className="text-ink-900 font-black">{t.unvan}</strong></span>
                <span className="text-ink-300">|</span>
                <span className="text-ink-500 font-semibold">Satır Sayısı: <strong className="text-ink-900 font-black">{kalemler.length}</strong></span>
                <span className="text-ink-300">|</span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={toggleFikslemePanel}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1"
                  >
                    <Calculator size={11} className="text-amber-600" /> Kur Kes / Fiksle
                  </button>
                  <InfoTooltip text="Toptancı ile olan altın borcunuzu döviz veya TL karşılığına (veya tersine) sabitleyerek cari kurlar üzerinden dönüştürmenizi (fikslemenizi) sağlar." position="bottom" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Toplam Altın Etkisi:</span>
                  <span className={`font-mono font-black text-sm ${totalHas < 0 ? 'text-emerald-600' : totalHas > 0 ? 'text-rose-600' : 'text-ink-700'}`}>
                    {totalHas > 0 ? '+' : ''}{totalHas.toFixed(3)} gr
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Toplam TL Etkisi:</span>
                  <span className={`font-mono font-black text-sm ${totalTl < 0 ? 'text-emerald-600' : totalTl > 0 ? 'text-rose-600' : 'text-ink-700'}`}>
                    {totalTl > 0 ? '+' : ''}{totalTl.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>
              </div>
            </div>

            {/* Fiksleme (Kur Kesme) Paneli */}
            {fikslemePanelAcik && (
              <div className="mx-6 mt-4 p-4 bg-amber-50/30 border border-amber-200/80 rounded-lg animate-fadeIn">
                <div className="flex items-center justify-between mb-3 border-b border-amber-100 pb-2">
                  <h3 className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                    <Calculator size={14} className="text-amber-600" /> Fiksleme (Kur Kesme) Hesaplayıcısı
                  </h3>
                  <button 
                    type="button" 
                    onClick={() => setFikslemePanelAcik(false)}
                    className="text-[10px] text-amber-700 hover:text-amber-950 font-bold"
                  >
                    Kapat ×
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
                  {/* 0. Fiksleme Yönü */}
                  <div>
                    <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center">
                      İşlem Yönü
                      <InfoTooltip text={fikslemeYonu === 'ALTIN_TO_PARA' ? 'Altın borcunuzu sabitleyerek para borcuna çevirir.' : fikslemeYonu === 'PARA_TO_ALTIN' ? 'Para borcunuzu sabitleyerek altın borcuna çevirir.' : 'TL/Döviz borcunuzu başka bir döviz cinsine çevirir.'} position="bottom" />
                    </label>
                    <select
                      className="w-full h-9 px-2 text-xs font-bold bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                      value={fikslemeYonu}
                      onChange={(e) => {
                        const newYonu = e.target.value;
                        setFikslemeYonu(newYonu);
                        
                        const gf = parseFloat(fikslemeGramFiyat) || 0;
                        const kur = fikslemeParaBirimi === 'TRY' ? 1 : (parseFloat(fikslemeDovizKuru) || 1);
                        
                        if (newYonu === 'ALTIN_TO_PARA') {
                          const val = t?.bakiye_has ? Math.abs(t.bakiye_has) : 0;
                          setFikslemeMiktar(val > 0 ? val.toFixed(3) : '');
                          setFikslemeTutar(val > 0 && gf > 0 ? (val * gf).toFixed(2) : '');
                        } else {
                          const bakiyeTL = t?.bakiye_tl ? Math.abs(t.bakiye_tl) : 0;
                          const gfTL = gf * kur;
                          if (gfTL > 0 && bakiyeTL > 0) {
                            const miktarVal = bakiyeTL / gfTL;
                            setFikslemeMiktar(miktarVal.toFixed(3));
                            setFikslemeTutar((bakiyeTL / kur).toFixed(2));
                          } else {
                            setFikslemeMiktar('');
                            setFikslemeTutar('');
                          }
                        }
                      }}
                    >
                      <option value="ALTIN_TO_PARA">🥇 Altın ➔ 💵 Para</option>
                      <option value="PARA_TO_ALTIN">💵 Para ➔ 🥇 Altın</option>
                    </select>
                  </div>

                  {/* 1. Miktar (Altın) */}
                  <div>
                    <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center">
                      Has Altın (gr)
                      <InfoTooltip text="Fikslenecek veya çevrilecek net 24K has altın miktarını gram olarak girin." position="bottom" />
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        onKeyDown={(e) => {
                          if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                            e.preventDefault();
                          }
                        }}
                        className="w-full h-9 px-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="0.00"
                        value={fikslemeMiktar}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          const sanitized = valStr.replace(/-/g, '');
                          setFikslemeMiktar(sanitized);
                          
                          const mVal = parseFloat(sanitized) || 0;
                          const gf = parseFloat(fikslemeGramFiyat) || 0;
                          if (gf > 0 && mVal > 0) {
                            setFikslemeTutar((mVal * gf).toFixed(2));
                          } else {
                            setFikslemeTutar('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const gf = parseFloat(fikslemeGramFiyat) || 0;
                          const kur = fikslemeParaBirimi === 'TRY' ? 1 : (parseFloat(fikslemeDovizKuru) || 1);
                          const gfTL = gf * kur;

                          if (fikslemeYonu === 'ALTIN_TO_PARA') {
                            const bakiyeHas = t?.bakiye_has ? Math.abs(t.bakiye_has) : 0;
                            if (bakiyeHas > 0) {
                              setFikslemeMiktar(bakiyeHas.toFixed(3));
                              setFikslemeTutar(gf > 0 ? (bakiyeHas * gf).toFixed(2) : '');
                            }
                          } else {
                            let bakiyeCash = 0;
                            if (fikslemeParaBirimi === 'TRY') bakiyeCash = t?.bakiye_tl ? Math.abs(t.bakiye_tl) : 0;
                            else if (fikslemeParaBirimi === 'USD') bakiyeCash = t?.bakiye_usd ? Math.abs(t.bakiye_usd) : 0;
                            else if (fikslemeParaBirimi === 'EUR') bakiyeCash = t?.bakiye_eur ? Math.abs(t.bakiye_eur) : 0;
                            
                            if (gfTL > 0 && bakiyeCash > 0) {
                              const miktarVal = bakiyeCash / gfTL;
                              setFikslemeMiktar(miktarVal.toFixed(3));
                              setFikslemeTutar((bakiyeCash / kur).toFixed(2));
                            }
                          }
                        }}
                        className="px-2 h-9 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold border border-amber-300 rounded whitespace-nowrap"
                        title="Kalan borcun tamamı"
                      >
                        Tüm Borç
                      </button>
                    </div>
                  </div>

                  {/* 2. {fikslemeYonu === 'PARA_TO_PARA' ? 'Hedef Tutar' : 'Tutar (Para)'} */}
                  <div>
                    <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center">
                      Tutar ({fikslemeParaBirimi})
                      <InfoTooltip text="Fikslenecek veya çevrilecek toplam para tutarını girin (girilen tutara göre has altın miktarı otomatik hesaplanır)." position="bottom" />
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        onKeyDown={(e) => {
                          if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                            e.preventDefault();
                          }
                        }}
                        className="w-full h-9 px-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="0.00"
                        value={fikslemeTutar}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          const sanitized = valStr.replace(/-/g, '');
                          setFikslemeTutar(sanitized);
                          
                          const tVal = parseFloat(sanitized) || 0;
                          const gf = parseFloat(fikslemeGramFiyat) || 0;
                          if (gf > 0 && tVal > 0) {
                            setFikslemeMiktar((tVal / gf).toFixed(3));
                          } else {
                            setFikslemeMiktar('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const gf = parseFloat(fikslemeGramFiyat) || 0;
                          const kur = fikslemeParaBirimi === 'TRY' ? 1 : (parseFloat(fikslemeDovizKuru) || 1);
                          const gfTL = gf * kur;

                          if (fikslemeYonu === 'ALTIN_TO_PARA') {
                            const bakiyeHas = t?.bakiye_has ? Math.abs(t.bakiye_has) : 0;
                            if (bakiyeHas > 0) {
                              setFikslemeMiktar(bakiyeHas.toFixed(3));
                              setFikslemeTutar(gf > 0 ? (bakiyeHas * gf).toFixed(2) : '');
                            }
                          } else {
                            let bakiyeCash = 0;
                            if (fikslemeParaBirimi === 'TRY') bakiyeCash = t?.bakiye_tl ? Math.abs(t.bakiye_tl) : 0;
                            else if (fikslemeParaBirimi === 'USD') bakiyeCash = t?.bakiye_usd ? Math.abs(t.bakiye_usd) : 0;
                            else if (fikslemeParaBirimi === 'EUR') bakiyeCash = t?.bakiye_eur ? Math.abs(t.bakiye_eur) : 0;
                            
                            if (gfTL > 0 && bakiyeCash > 0) {
                              const miktarVal = bakiyeCash / gfTL;
                              setFikslemeMiktar(miktarVal.toFixed(3));
                              setFikslemeTutar((bakiyeCash / kur).toFixed(2));
                            }
                          }
                        }}
                        className="px-2 h-9 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold border border-amber-300 rounded whitespace-nowrap"
                        title="Kalan borcun tamamı"
                      >
                        Tüm Borç
                      </button>
                    </div>
                  </div>
                  
                  {/* 3. Para Birimi */}
                  <div>
                    <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center">
                      Para Birimi
                      <InfoTooltip text="Fiksleme işleminin yapılacağı döviz veya Türk Lirası cinsi (TRY, USD veya EUR)." position="bottom" />
                    </label>
                    <select
                      className="w-full h-9 px-2 text-xs font-bold bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                      value={fikslemeParaBirimi}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFikslemeParaBirimi(val);
                        let newGramFiyat = '';
                        let newDovizKuru = '';
                        if (val === 'TRY') {
                          newGramFiyat = kurlar?.gram_altin_24k_try ? kurlar.gram_altin_24k_try.toFixed(2) : '';
                          newDovizKuru = '';
                        } else if (val === 'USD') {
                          const baseGold = kurlar?.gram_altin_24k_try || 0;
                          const usdVal = kurlar?.usd_try || 1;
                          newGramFiyat = baseGold && usdVal ? (baseGold / usdVal).toFixed(2) : '';
                          newDovizKuru = usdVal.toString();
                        } else if (val === 'EUR') {
                          const baseGold = kurlar?.gram_altin_24k_try || 0;
                          const eurVal = kurlar?.eur_try || 1;
                          newGramFiyat = baseGold && eurVal ? (baseGold / eurVal).toFixed(2) : '';
                          newDovizKuru = eurVal.toString();
                        }
                        
                        setFikslemeGramFiyat(newGramFiyat);
                        setFikslemeDovizKuru(newDovizKuru);
                        
                        // Recalculate
                        const gf = parseFloat(newGramFiyat) || 0;
                        const newKur = val === 'TRY' ? 1 : (parseFloat(newDovizKuru) || 1);
                        
                        if (fikslemeYonu === 'PARA_TO_ALTIN') {
                          let bakiyeCash = 0;
                          if (val === 'TRY') bakiyeCash = t?.bakiye_tl ? Math.abs(t.bakiye_tl) : 0;
                          else if (val === 'USD') bakiyeCash = t?.bakiye_usd ? Math.abs(t.bakiye_usd) : 0;
                          else if (val === 'EUR') bakiyeCash = t?.bakiye_eur ? Math.abs(t.bakiye_eur) : 0;
                          
                          const gfTL = gf * newKur;
                          if (gfTL > 0 && bakiyeCash > 0) {
                            const miktarVal = bakiyeCash / gfTL;
                            setFikslemeMiktar(miktarVal.toFixed(3));
                            setFikslemeTutar((bakiyeCash / newKur).toFixed(2));
                          } else {
                            setFikslemeMiktar('');
                            setFikslemeTutar('');
                          }
                        } else {
                          // ALTIN_TO_PARA
                          const mVal = parseFloat(fikslemeMiktar) || 0;
                          if (mVal > 0 && gf > 0) {
                            setFikslemeTutar((mVal * gf).toFixed(2));
                          } else {
                            setFikslemeTutar('');
                          }
                        }
                      }}
                    >
                      <option value="TRY">TRY ₺</option>
                      <option value="USD">USD $</option>
                      <option value="EUR">EUR €</option>
                    </select>
                  </div>

                  {fikslemeYonu === 'PARA_TO_PARA' && (
                      <div>
                        <label className="block text-[10px] font-bold text-ink-500 uppercase mb-1 flex items-center">
                          Hedef Döviz
                        </label>
                        <select
                          className="w-full h-9 px-2 text-xs font-bold bg-white border border-ink-200 rounded outline-none focus:ring-1 focus:ring-gold-500"
                          value={fikslemeHedefParaBirimi}
                          onChange={(e) => setFikslemeHedefParaBirimi(e.target.value)}
                        >
                          <option value="TRY">TRY ₺</option>
                          <option value="USD">USD $</option>
                          <option value="EUR">EUR €</option>
                        </select>
                      </div>
                    )}
                    {/* 4. {fikslemeYonu === 'PARA_TO_PARA' ? 'Parite / Kur' : 'Gram Fiyatı'} */}
                  <div>
                    <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center">
                      {fikslemeYonu === 'PARA_TO_PARA' ? 'Parite / Kur' : 'Gram Fiyatı'} ({fikslemeParaBirimi})
                      <InfoTooltip text="Çevrimde kullanılacak 1 gram Has Altının fiyatı." position="bottom" />
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full h-9 px-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="0.00"
                      value={fikslemeGramFiyat}
                      onChange={(e) => {
                        const newGFStr = e.target.value;
                        setFikslemeGramFiyat(newGFStr);
                        const newGF = parseFloat(newGFStr) || 0;
                        if (newGF > 0) {
                          if (fikslemeYonu === 'ALTIN_TO_PARA') {
                            const mVal = parseFloat(fikslemeMiktar) || 0;
                            setFikslemeTutar(mVal > 0 ? (mVal * newGF).toFixed(2) : '');
                          } else if (fikslemeYonu === 'PARA_TO_ALTIN') {
                            const tVal = parseFloat(fikslemeTutar) || 0;
                            setFikslemeMiktar(tVal > 0 ? (tVal / newGF).toFixed(3) : '');
                          } else if (fikslemeYonu === 'PARA_TO_PARA') {
                            const mVal = parseFloat(fikslemeMiktar) || 0;
                            setFikslemeTutar(mVal > 0 ? (mVal * newGF).toFixed(2) : '');
                          }
                        }
                      }}
                    />
                  </div>

                  {/* 5. Döviz Kuru */}
                  <div>
                    {fikslemeParaBirimi !== 'TRY' ? (
                      <>
                        <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center">
                          {fikslemeYonu === 'PARA_TO_PARA' ? 'İşlem Kuru (Opsiyonel)' : 'Döviz Kuru (TL)'}
                          <InfoTooltip text="Hedef döviz biriminin (USD/EUR) Türk Lirası karşılığı olan işlem kuru." position="bottom" />
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          className="w-full h-9 px-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                          placeholder="0.0000"
                          value={fikslemeDovizKuru}
                          onChange={(e) => setFikslemeDovizKuru(e.target.value)}
                        />
                      </>
                    ) : (
                      <>
                        <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center invisible">
                          -
                        </label>
                        <div className="h-9 flex items-center justify-center text-amber-400 text-xs font-bold font-mono">
                          —
                        </div>
                      </>
                    )}
                  </div>

                  {/* 5. Fişe Aktar Butonu */}
                  <button
                    type="button"
                    onClick={() => {
                      const miktar = parseFloat(fikslemeMiktar) || 0;
                      const tutarVal = parseFloat(fikslemeTutar) || 0;
                      const gramFiyat = parseFloat(fikslemeGramFiyat) || 0;
                      if (miktar <= 0 || tutarVal <= 0 || gramFiyat <= 0) {
                        alert("Lütfen miktar, tutar ve fiyat giriniz.");
                        return;
                      }
                      
                      let dovizTutar = 0;
                      let kur = 1;
                      let tlTutar = 0;
                      
                      if (fikslemeParaBirimi === 'TRY') {
                        tlTutar = tutarVal;
                      } else {
                        dovizTutar = tutarVal;
                        kur = parseFloat(fikslemeDovizKuru) || 0;
                        tlTutar = dovizTutar * kur;
                      }

                      // Dynamic transaction signing logic
                      let goldIslemTipi = '';
                      let cashIslemTipi = '';

                      if (fikslemeYonu === 'ALTIN_TO_PARA') {
                        const isGoldDebt = (t?.bakiye_has ?? 0) >= 0;
                        goldIslemTipi = isGoldDebt ? 'Ödeme' : 'Borçlanma';
                        cashIslemTipi = isGoldDebt ? 'Borçlanma' : 'Ödeme';
                      } else {
                        let isCashDebt = false;
                        if (fikslemeParaBirimi === 'TRY') isCashDebt = (t?.bakiye_tl ?? 0) >= 0;
                        else if (fikslemeParaBirimi === 'USD') isCashDebt = (t?.bakiye_usd ?? 0) >= 0;
                        else if (fikslemeParaBirimi === 'EUR') isCashDebt = (t?.bakiye_eur ?? 0) >= 0;
                        
                        cashIslemTipi = isCashDebt ? 'Ödeme' : 'Borçlanma';
                        goldIslemTipi = isCashDebt ? 'Borçlanma' : 'Ödeme';
                      }

                      const miktarText = `${parseFloat(fikslemeMiktar).toFixed(3)} gr Has`;
                      const tutarFormatted = (parseFloat(fikslemeTutar) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
                      const tutarText = `${tutarFormatted} ${fikslemeParaBirimi}`;
                      const gramFiyatiText = `${parseFloat(fikslemeGramFiyat).toFixed(2)} ${fikslemeParaBirimi}`;
                      const dovizKuruText = fikslemeParaBirimi !== 'TRY' ? ` | Döviz Kuru: ${parseFloat(fikslemeDovizKuru).toFixed(4)}` : '';
                      const islemAciklamasi = `Kur Kesme / Fiksleme [Bağlantı: ${miktarText} ➔ ${tutarText}${dovizKuruText} | 1 gr = ${gramFiyatiText}]`;

                      const islem1 = {
                        id: Date.now() + Math.random(),
                        islem_tipi: goldIslemTipi,
                        islem_detayi: islemAciklamasi,
                        urun: '24 Ayar Has',
                        urun_kodu: '24_AYAR',
                        urun_kategorisi: 'ALTIN',
                        adet: 1,
                        brut: miktar.toString(),
                        milyem: 1.0000,
                        has_altin: miktar.toFixed(3),
                        tl_tutar: '',
                        para_birimi: 'TRY',
                        doviz_tutar: '',
                        doviz_kuru: ''
                      };

                      const islem2 = {
                        id: Date.now() + Math.random(),
                        islem_tipi: cashIslemTipi,
                        islem_detayi: islemAciklamasi,
                        urun: 'Nakit',
                        urun_kodu: 'NAKIT_TL',
                        urun_kategorisi: 'NAKIT',
                        adet: 1,
                        brut: '',
                        milyem: 0,
                        has_altin: '',
                        tl_tutar: tlTutar.toFixed(2),
                        para_birimi: fikslemeParaBirimi,
                        doviz_tutar: fikslemeParaBirimi !== 'TRY' ? dovizTutar.toFixed(2) : '',
                        doviz_kuru: fikslemeParaBirimi !== 'TRY' ? kur.toString() : ''
                      };

                      const temizKalemler = kalemler.filter(k => parseFloat(k.has_altin) > 0 || parseFloat(k.tl_tutar) > 0);
                      setKalemler([...temizKalemler, islem1, islem2]);
                      setFikslemePanelAcik(false);
                    }}
                    className="w-full h-9 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded shadow transition-colors flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={14} /> Fişe Aktar
                  </button>
                </div>

                <div className="mt-3 bg-amber-100/50 p-2.5 rounded border border-amber-200 flex justify-between items-center text-xs font-bold text-amber-900">
                  <div>
                    <span>{fiksGoldLabel} </span>
                    <span className={`font-mono ${fiksGoldColorClass}`}>
                      {fiksGoldValueSign}{parseFloat(fikslemeMiktar || 0).toFixed(3)} gr Has
                    </span>
                  </div>
                  <div>
                    {fikslemeParaBirimi !== 'TRY' && (
                      <div className="mr-6 inline-block">
                        <span>Döviz Değeri: </span>
                        <span className="font-mono text-ink-800">
                          {(parseFloat(fikslemeTutar) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {fikslemeParaBirimi === 'USD' ? '$' : '€'}
                        </span>
                      </div>
                    )}
                    <span>{fiksTlLabel} </span>
                    <span className={`font-mono ${fiksTlColorClass}`}>
                      {fiksTlValueSign}{fiksTlValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Grid Table */}
            <div className="flex-1 overflow-auto p-6 bg-ink-50/20">
              <div className="min-w-[950px] bg-white border border-ink-200 shadow-sm">
                <table className="w-full text-left border-collapse modal-grid-table">
                  <thead>
                    <tr className="bg-ink-900 text-white border-b border-ink-800">
                      <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider w-10">
                        #
                        <InfoTooltip text="Satır numarası." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider w-[12%]">
                        İşlem / Yön
                        <InfoTooltip text="Yapılan işlemin cari yönünü belirtir (Borçlanma/Ödeme)." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider w-[13%]">
                        İşlem Detayı
                        <InfoTooltip text="İşlemin detay/ödeme türü açıklamasını seçin." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider w-[13%]">
                        Ürün / Ayar (Seç)
                        <InfoTooltip text="Fatura kalemi ürününü listeden seçin." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider w-[6%]">
                        Adet
                        <InfoTooltip text="Sarrafiye ürünler için adet miktarı." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider w-[8%]">
                        Brüt Gr
                        <InfoTooltip text="İşlem gören ürünün ham / brüt gram ağırlığı." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider w-[6%]">
                        Milyem
                        <InfoTooltip text="Ürünün milyem (saflık derecesi) değeri." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider w-[11%] text-gold-400">
                        Net Has
                        <InfoTooltip text="Otomatik hesaplanan veya girilen 24K saf altın miktarı." position="bottom" />
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider w-[27%] text-emerald-400">
                        Tutar
                        <InfoTooltip text="İşlem para/işçilik tutarı. Döviz ise birim ve kur girerek kaydedebilirsiniz. Ürünlerin toplam işçilik bedelini bu alana girebilirsiniz." position="left" />
                      </th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {kalemler.map((kalem, index) => {
                      const isBorc = kalem.islem_tipi === 'Borçlanma';
                      const isSarrafiye = kalem.urun_kategorisi === 'SARRAFIYE';
                      const isNakit = kalem.urun_kategorisi === 'NAKIT' || kalem.urun_kategorisi === 'DÖVİZ' || kalem.urun_kategorisi === 'DOVIZ';
                      const isPirlanta = kalem.urun_kategorisi === 'PIRLANTA';
                      
                      return (
                        <tr 
                          key={kalem.id} 
                          data-row-id={kalem.id}
                          className="border-b border-ink-155 hover:bg-ink-50/50 focus-within:bg-gold-50/20 transition-colors duration-150"
                        >
                          {/* # Row Index */}
                          <td className="px-2 py-2 text-center text-xs font-mono font-bold text-ink-300 select-none">
                            {index + 1}
                          </td>
                          
                          {/* Tip select */}
                          <td className="p-0 border-r border-ink-150">
                            <div className="flex items-center justify-between w-full h-full pr-1.5">
                              <select
                                className={`flex-1 h-11 px-2.5 bg-transparent border-none outline-none font-bold text-xs cursor-pointer select-custom ${isBorc ? 'text-rose-700' : 'text-emerald-700'}`}
                                value={kalem.islem_tipi}
                                onChange={(e) => updateKalem(kalem.id, 'islem_tipi', e.target.value)}
                              >
                                <option value="Borçlanma" className="text-rose-700 font-bold">Borçlanma (Alış)</option>
                                <option value="Ödeme" className="text-emerald-700 font-bold">Ödeme Yapıldı</option>
                              </select>
                              <InfoTooltip 
                                text={isBorc 
                                  ? "Borçlanma (Alış): Toptancıdan altın, ürün veya nakit borç aldığınızı belirtir. Altın ve TL borcunuzu artırır." 
                                  : "Ödeme: Toptancıya ödeme yaptığınızı veya altın/ürün teslim ettiğinizi belirtir. Altın ve TL borcunuzu azaltır."
                                } 
                                position="bottom" 
                              />
                            </div>
                          </td>
                          
                          {/* Detay select */}
                          <td className="p-0 border-r border-ink-150">
                            <select
                              className="w-full h-11 px-2.5 bg-transparent border-none outline-none text-xs text-ink-800 font-bold cursor-pointer"
                              value={kalem.islem_detayi}
                              onChange={(e) => updateKalem(kalem.id, 'islem_detayi', e.target.value)}
                            >
                              {(DETAY_SECENEKLERI[kalem.islem_tipi] || []).map(d => (
                                <option key={d} value={d} className="text-ink-800 font-semibold">{d}</option>
                              ))}
                            </select>
                          </td>
                          
                          {/* Ürün Seçim Butonu */}
                          <td className="p-0 border-r border-ink-150">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSelectionRowId(kalem.id);
                                setUrunSeciciAcik(true);
                                setUrunAramaSorgusu('');
                                setUrunSeciciKategori('HEPSİ');
                                setHighlightedProductIndex(0);
                              }}
                              className="w-full h-11 px-3 text-left font-bold text-xs text-ink-900 hover:bg-gold-50/10 flex items-center justify-between transition-colors outline-none focus:ring-1 focus:ring-gold-500/30"
                            >
                              <span className={isNakit ? 'text-emerald-700 font-black' : 'text-ink-900 font-bold'}>
                                {isNakit ? '💸 Nakit' : kalem.urun}
                              </span>
                              <span className="text-[9px] bg-ink-100 hover:bg-gold-100 border border-ink-250 px-1.5 py-0.5 text-ink-500 hover:text-gold-700 transition-colors uppercase font-mono">Seç 🔍</span>
                            </button>
                          </td>
                          
                          {/* Adet input */}
                          <td className="p-0 border-r border-ink-150" style={(!isSarrafiye && !isNakit && !isPirlanta) ? disabledCellBg : {}}>
                            {(isSarrafiye || isPirlanta) ? (
                              <input
                                type="number"
                                min="1"
                                className="w-full h-11 px-2 text-center font-mono font-bold text-sm bg-transparent border-none outline-none focus:bg-white focus:ring-1 focus:ring-gold-500/20 transition-all"
                                value={kalem.adet}
                                onChange={(e) => updateKalem(kalem.id, 'adet', e.target.value)}
                                onKeyDown={(e) => handleInputKeyDown(e, index, 'adet')}
                              />
                            ) : (
                              <span className="text-ink-300 block text-center select-none font-mono font-bold">—</span>
                            )}
                          </td>
                          
                          {/* Brüt Gr input */}
                          <td className="p-0 border-r border-ink-150" style={(isSarrafiye || isNakit || isPirlanta) ? disabledCellBg : {}}>
                            {(!isSarrafiye && !isNakit && !isPirlanta) ? (
                              <input
                                  type="text"
                                  placeholder="0,00"
                                  className="w-full h-11 px-2.5 text-right font-mono text-sm bg-transparent border-none outline-none focus:bg-white focus:ring-1 focus:ring-gold-500/20 transition-all"
                                  value={kalem.brut}
                                  onChange={(e) => updateKalem(kalem.id, 'brut', e.target.value)}
                                onKeyDown={(e) => handleInputKeyDown(e, index, 'brut')}
                              />
                            ) : (
                              <span className="text-ink-300 block text-center select-none font-mono font-bold">—</span>
                            )}
                          </td>
                          
                          {/* Milyem input */}
                          <td className="p-0 border-r border-ink-150" style={(isSarrafiye || isNakit || isPirlanta) ? disabledCellBg : {}}>
                            {(!isSarrafiye && !isNakit && !isPirlanta) ? (
                              <input
                                type="number"
                                step="0.001"
                                placeholder="0.000"
                                className="w-full h-11 px-2 text-center font-mono text-xs text-ink-500 bg-transparent border-none outline-none focus:bg-white focus:ring-1 focus:ring-gold-500/20 transition-all"
                                value={kalem.milyem}
                                onChange={(e) => updateKalem(kalem.id, 'milyem', e.target.value)}
                                onKeyDown={(e) => handleInputKeyDown(e, index, 'milyem')}
                              />
                            ) : (
                              <span className="text-ink-300 block text-center select-none font-mono font-bold">—</span>
                            )}
                          </td>
                          
                          {/* Net Has input */}
                          <td className="p-0 border-r border-ink-150" style={isNakit ? disabledCellBg : {}}>
                            {!isNakit ? (
                              <input
                                type="number"
                                step="0.001"
                                placeholder="0.000"
                                className="w-full h-11 px-2.5 text-right font-mono font-black text-sm text-gold-600 bg-gold-50/10 focus:bg-white border-none outline-none transition-all focus:ring-1 focus:ring-gold-500/20"
                                value={kalem.has_altin}
                                onChange={(e) => updateKalem(kalem.id, 'has_altin', e.target.value)}
                                onKeyDown={(e) => handleInputKeyDown(e, index, 'has_altin')}
                              />
                            ) : (
                              <span className="text-ink-300 block text-center select-none font-mono font-bold">—</span>
                            )}
                          </td>
                          
                          {/* TL Tutar input */}
                          <td className="p-0 border-r border-ink-150">
                            <div className="flex flex-col justify-center h-full px-1.5 py-0.5 gap-0.5 min-w-[150px]">
                              <div className="flex items-center gap-1">
                                <select
                                  value={kalem.para_birimi || 'TRY'}
                                  onChange={(e) => updateKalem(kalem.id, 'para_birimi', e.target.value)}
                                  className="h-8 bg-transparent text-xs font-bold text-ink-600 outline-none cursor-pointer border-r border-ink-200 pr-1 shrink-0"
                                >
                                  <option value="TRY">₺ Türk Lirası</option>
                                  <option value="USD">$ Amerikan Doları</option>
                                  <option value="EUR">€ Euro</option>
                                </select>
                                
                                {kalem.para_birimi && kalem.para_birimi !== 'TRY' ? (
                                  <>
                                    <input
                                      type="text"
                                      placeholder="Tutar"
                                      className="w-20 h-8 text-right font-mono font-bold text-xs text-ink-800 bg-ink-50/50 border border-ink-200 px-1.5 outline-none rounded focus:border-gold-500"
                                      value={kalem.doviz_tutar || ''}
                                      onChange={(e) => updateKalem(kalem.id, 'doviz_tutar', e.target.value)}
                                      onKeyDown={(e) => handleInputKeyDown(e, index, 'tl_tutar')}
                                    />
                                    <span className="text-[10px] text-ink-400 font-bold select-none">@</span>
                                    <input
                                      type="text"
                                      placeholder="Kur"
                                      className="w-16 h-8 text-right font-mono text-xs text-ink-500 bg-ink-50/50 border border-ink-200 px-1 outline-none rounded focus:border-gold-500"
                                      value={kalem.doviz_kuru || ''}
                                      onChange={(e) => updateKalem(kalem.id, 'doviz_kuru', e.target.value)}
                                      onKeyDown={(e) => handleInputKeyDown(e, index, 'tl_tutar')}
                                    />
                                  </>
                                ) : (
                                  <input
                                    type="text"
                                    placeholder="0.00"
                                    className="w-full h-8 text-right font-mono font-black text-sm text-emerald-600 bg-transparent border-none outline-none focus:bg-white"
                                    value={kalem.tl_tutar}
                                    onChange={(e) => updateKalem(kalem.id, 'tl_tutar', e.target.value)}
                                    onKeyDown={(e) => handleInputKeyDown(e, index, 'tl_tutar')}
                                  />
                                )}
                              </div>
                              {kalem.para_birimi && kalem.para_birimi !== 'TRY' && kalem.tl_tutar && (
                                <div className="text-[10px] text-right text-emerald-600 font-mono font-bold select-none">
                                  {(parseTrNumber(kalem.tl_tutar) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                </div>
                              )}
                            </div>
                          </td>
                          
                          {/* Sil button */}
                          <td className="p-0 text-center">
                            <button
                              onClick={() => handleSatirSil(kalem.id)}
                              className={`w-full h-11 flex items-center justify-center transition-colors ${
                                kalemler.length === 1 
                                  ? 'text-ink-200 cursor-not-allowed' 
                                  : 'text-ink-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              disabled={kalemler.length === 1}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleYeniSatir}
                className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-gold-600 hover:text-gold-700 bg-white hover:bg-gold-50/30 w-full py-3.5 border border-dashed border-gold-300 hover:border-gold-500 transition-all select-none"
              >
                <Plus size={14} strokeWidth={2.5} /> Yeni Satır / Kalem Ekle
              </button>
            </div>

            {/* Footer / Alt Toplamlar */}
            <div className="p-6 border-t border-ink-150 bg-white flex flex-col md:flex-row md:items-center justify-between gap-6">
              
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Fatura / İşlem Fişi Genel Notu</label>
                <input
                  type="text" 
                  placeholder="İrsaliye no, fatura no veya işlemle ilgili genel not..."
                  className="w-full bg-ink-50 border border-ink-200 px-4 py-3 text-xs font-semibold text-ink-900 outline-none focus:border-gold-500"
                  value={faturaNotu} 
                  onChange={e => setFaturaNotu(e.target.value)}
                />
                
                {/* Keyboard Shortcut Guidelines */}
                <div className="flex items-center gap-4 text-[10px] text-ink-400 font-mono mt-3 select-none">
                  <span className="flex items-center gap-1"><kbd className="bg-ink-100 px-1.5 py-0.5 border border-ink-200 text-ink-600 font-sans font-bold">Tab</kbd> Sonraki Hücre / Yeni Satır</span>
                  <span className="flex items-center gap-1"><kbd className="bg-ink-100 px-1.5 py-0.5 border border-ink-200 text-ink-600 font-sans font-bold">F2</kbd> veya En Son Hücrede <kbd className="bg-ink-100 px-1.5 py-0.5 border border-ink-200 text-ink-600 font-sans font-bold">Enter</kbd> Kaydet</span>
                  <span className="flex items-center gap-1"><kbd className="bg-ink-100 px-1.5 py-0.5 border border-ink-200 text-ink-600 font-sans font-bold">Esc</kbd> Kapat</span>
                </div>
              </div>

              <div className="flex items-center gap-4 min-w-[340px]">
                <button
                  onClick={() => setModalAcik(false)}
                  className="flex-1 bg-white border border-ink-200 text-ink-600 py-3.5 text-xs font-bold hover:bg-ink-50 transition-colors uppercase tracking-wider"
                >
                  Vazgeç
                </button>
                <button
                  onClick={handleCokluKaydet}
                  className="flex-1 flex items-center justify-center gap-2 bg-gold-500 text-white py-3.5 text-xs font-bold hover:bg-gold-600 transition-colors shadow-lg shadow-gold-500/20 uppercase tracking-wider"
                >
                  <CheckCircle2 size={16} /> Fişi Kaydet [F2]
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─── ALT-MODAL: MLJEWEL STİLİ GÖSEL ÜRÜN SEÇİM TABLOSU ─── */}
      {urunSeciciAcik && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white max-w-2xl w-full border border-ink-200 shadow-2xl p-6 flex flex-col max-h-[85vh] animate-fadeIn">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-ink-150 mb-4">
              <div>
                <h3 className="text-base font-black text-ink-900 flex items-center gap-2">
                  ✨ Ürün ve Ayar Seçim Paneli
                </h3>
                <p className="text-[11px] text-ink-400 mt-0.5">Seçmek istediğiniz mamul, sarrafiye veya nakit türünü belirleyin.</p>
              </div>
              <button 
                onClick={() => setUrunSeciciAcik(false)}
                className="p-1 hover:bg-ink-100 rounded text-ink-400 hover:text-ink-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Arama Kutusu */}
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Ürün adı, kodu veya grubuna göre ara... (Ok tuşları ↕ ve Enter ile hızlı seçim)"
                className="w-full bg-ink-50 border border-ink-200 pl-9 pr-3 py-3 text-xs font-semibold text-ink-900 outline-none focus:border-gold-500"
                value={urunAramaSorgusu}
                onChange={e => {
                  setUrunAramaSorgusu(e.target.value);
                  setHighlightedProductIndex(0);
                }}
                autoFocus
                onKeyDown={(e) => handleUrunSeciciKeyDown(e, filtrelenmisUrunler)}
              />
              <span className="absolute left-3 top-3.5 text-ink-400">
                <Search size={14} />
              </span>
            </div>

            {/* Kategori Tabları — Dinamik */}
            <div className="flex flex-wrap gap-1.5 mb-4 border-b border-ink-150 pb-2.5">
              <button
                type="button"
                onClick={() => { setUrunSeciciKategori('HEPSİ'); setHighlightedProductIndex(0); }}
                className={`px-3 py-1.5 text-[10px] font-black tracking-wide border transition-all ${
                  urunSeciciKategori === 'HEPSİ'
                    ? 'bg-gold-500 border-gold-500 text-white'
                    : 'border-ink-200 text-ink-500 hover:border-gold-300 bg-ink-50'
                }`}
              >
                📂 Tüm Ürünler
              </button>
              {kategorilerListesi.map(kat => (
                <button
                  key={kat.id}
                  type="button"
                  onClick={() => { setUrunSeciciKategori(kat.ad); setHighlightedProductIndex(0); }}
                  className={`px-3 py-1.5 text-[10px] font-black tracking-wide border transition-all ${
                    urunSeciciKategori === kat.ad
                      ? 'bg-gold-500 border-gold-500 text-white'
                      : 'border-ink-200 text-ink-500 hover:border-gold-300 bg-ink-50'
                  }`}
                >
                  {kat.etiket}
                </button>
              ))}
            </div>

            {/* Ürün Listesi Tablosu */}
            <div className="flex-1 overflow-auto border border-ink-150 bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-ink-900 text-white border-b border-ink-800 font-mono text-[9px] tracking-wider uppercase">
                    <th className="px-4 py-2.5">Ürün Adı</th>
                    <th className="px-4 py-2.5">Ürün Kodu</th>
                    <th className="px-4 py-2.5">Grup / Sınıf</th>
                    <th className="px-4 py-2.5">Kategori</th>
                    <th className="px-4 py-2.5 text-right">Milyem / Has</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtrelenmisUrunler.map((product, idx) => {
                    const isSelected = idx === highlightedProductIndex;
                    return (
                      <tr
                        key={product.id}
                        onClick={() => handleUrunSec(activeSelectionRowId, product)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-gold-50 text-gold-900 font-bold border-l-4 border-l-gold-500 pl-3' 
                            : 'hover:bg-ink-50 text-ink-700'
                        }`}
                      >
                        <td className="px-4 py-2.5 font-bold">{product.ad}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-ink-400">{product.urun_cinsi}</td>
                        <td className="px-4 py-2.5 font-medium text-ink-500">{product.urun_grubu || 'Diğer'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide border ${
                            product.urun_kategorisi === 'ALTIN' ? 'bg-yellow-50 text-yellow-800 border-yellow-250' :
                            product.urun_kategorisi === 'SARRAFIYE' ? 'bg-amber-50 text-amber-800 border-amber-250' :
                            product.urun_kategorisi === 'PIRLANTA' ? 'bg-purple-50 text-purple-800 border-purple-250' :
                            'bg-emerald-50 text-emerald-800 border-emerald-250'
                          }`}>
                            {product.urun_kategorisi}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                          {product.milyem > 0 ? product.milyem.toFixed(4) :
                           product.has_karsiligi > 0 ? `${product.has_karsiligi.toFixed(4)} gr` :
                           '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {filtrelenmisUrunler.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-ink-400 italic">Aramaya uygun aktif ürün bulunamadı.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bilgilendirme Çubuğu */}
            <div className="pt-3 flex justify-between items-center text-[10px] text-ink-400 font-mono select-none">
              <span>Seçilen Sıra: {highlightedProductIndex + 1} / {filtrelenmisUrunler.length}</span>
              <div className="flex gap-2">
                <span><kbd className="bg-ink-100 px-1 py-0.2 border rounded">↕</kbd> Yön Tuşları</span>
                <span><kbd className="bg-ink-100 px-1 py-0.2 border rounded">Enter</kbd> Seç</span>
                <span><kbd className="bg-ink-100 px-1 py-0.2 border rounded">Esc</kbd> İptal</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
