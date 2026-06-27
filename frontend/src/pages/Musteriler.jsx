import React, { useState, useEffect } from 'react';
import { 
  Notebook, 
  Search, 
  Plus, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  User, 
  Users, 
  Phone, 
  Clock, 
  ChevronRight, 
  ArrowLeft, 
  Edit2,
  Tag
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { API_BASE } from '../apiConfig';

export function Musteriler() {
  const [emanetler, setEmanetler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState(null);
  const { addToast } = useToast();
  
  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
  const [isEditNoteModalOpen, setIsEditNoteModalOpen] = useState(false);

  // Form states
  const [customerFormData, setCustomerFormData] = useState({
    musteri_adi: '',
    telefon: '',
    not_detayi: '',
    kategori: 'Genel'
  });
  const [noteFormData, setNoteFormData] = useState({
    not_detayi: '',
    teslim_edildi_mi: false,
    kategori: 'Genel'
  });
  const [editCustomerFormData, setEditCustomerFormData] = useState({
    old_name: '',
    musteri_adi: '',
    telefon: ''
  });
  const [editNoteFormData, setEditNoteFormData] = useState({
    id: null,
    musteri_adi: '',
    telefon: '',
    not_detayi: '',
    teslim_edildi_mi: false,
    kategori: 'Genel'
  });

  const fetchEmanetler = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/musteri_emanetler`);
      if (!res.ok) throw new Error('Emanetler çekilemedi');
      const data = await res.json();
      setEmanetler(data);
    } catch (err) {
      addToast('Hata', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmanetler();
  }, []);

  // Group all emanetler by customer name
  const customers = React.useMemo(() => {
    const map = {};
    emanetler.forEach(item => {
      const name = item.musteri_adi.trim();
      if (!map[name]) {
        map[name] = {
          name: name,
          telefon: item.telefon || '',
          notes: [],
          pendingCount: 0,
          completedCount: 0,
          latestDate: item.olusturulma_tarihi || ''
        };
      }
      map[name].notes.push(item);
      if (item.teslim_edildi_mi) {
        map[name].completedCount += 1;
      } else {
        map[name].pendingCount += 1;
      }
      if (item.telefon && (!map[name].telefon || item.olusturulma_tarihi > map[name].latestDate)) {
        map[name].telefon = item.telefon;
      }
      if (item.olusturulma_tarihi && item.olusturulma_tarihi > map[name].latestDate) {
        map[name].latestDate = item.olusturulma_tarihi;
      }
    });
    return Object.values(map).sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [emanetler]);

  const filteredCustomers = React.useMemo(() => {
    if (!searchTerm) return customers;
    const lower = searchTerm.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(lower) || 
      c.telefon.toLowerCase().includes(lower) ||
      c.notes.some(n => n.not_detayi.toLowerCase().includes(lower) || (n.kategori && n.kategori.toLowerCase().includes(lower)))
    );
  }, [customers, searchTerm]);

  const activeCustomer = React.useMemo(() => {
    if (!selectedCustomerName) return null;
    return customers.find(c => c.name === selectedCustomerName) || null;
  }, [customers, selectedCustomerName]);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!customerFormData.musteri_adi.trim()) return;
    try {
      const noteText = customerFormData.not_detayi.trim() || 'Müşteri hesabı oluşturuldu';
      const res = await fetch(`${API_BASE}/musteri_emanetler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          musteri_adi: customerFormData.musteri_adi.trim(),
          telefon: customerFormData.telefon.trim(),
          not_detayi: noteText,
          teslim_edildi_mi: false,
          kategori: customerFormData.kategori
        })
      });
      if (!res.ok) throw new Error('Müşteri eklenemedi');
      addToast('Başarılı', 'Müşteri ve not eklendi', 'success');
      setIsCustomerModalOpen(false);
      setSelectedCustomerName(customerFormData.musteri_adi.trim());
      setCustomerFormData({ musteri_adi: '', telefon: '', not_detayi: '', kategori: 'Genel' });
      fetchEmanetler();
    } catch (err) {
      addToast('Hata', err.message, 'error');
    }
  };

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!activeCustomer || !noteFormData.not_detayi.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/musteri_emanetler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          musteri_adi: activeCustomer.name,
          telefon: activeCustomer.telefon,
          not_detayi: noteFormData.not_detayi.trim(),
          teslim_edildi_mi: noteFormData.teslim_edildi_mi,
          kategori: noteFormData.kategori
        })
      });
      if (!res.ok) throw new Error('Not eklenemedi');
      addToast('Başarılı', 'Not eklendi', 'success');
      setIsNoteModalOpen(false);
      setNoteFormData({ not_detayi: '', teslim_edildi_mi: false, kategori: 'Genel' });
      fetchEmanetler();
    } catch (err) {
      addToast('Hata', err.message, 'error');
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    const newName = editCustomerFormData.musteri_adi.trim();
    const newPhone = editCustomerFormData.telefon.trim();

    if (!newName || !activeCustomer) return;

    try {
      setLoading(true);
      const notesToUpdate = activeCustomer.notes;
      
      for (const note of notesToUpdate) {
        const res = await fetch(`${API_BASE}/musteri_emanetler/${note.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...note,
            musteri_adi: newName,
            telefon: newPhone
          })
        });
        if (!res.ok) throw new Error('Müşteri güncellenirken hata oluştu');
      }

      addToast('Başarılı', 'Müşteri bilgileri güncellendi', 'success');
      setIsEditCustomerModalOpen(false);
      setSelectedCustomerName(newName);
      fetchEmanetler();
    } catch (err) {
      addToast('Hata', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNote = async (e) => {
    e.preventDefault();
    if (!editNoteFormData.not_detayi.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/musteri_emanetler/${editNoteFormData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editNoteFormData)
      });
      if (!res.ok) throw new Error('Güncellenemedi');
      addToast('Başarılı', 'Not güncellendi', 'success');
      setIsEditNoteModalOpen(false);
      fetchEmanetler();
    } catch (err) {
      addToast('Hata', err.message, 'error');
    }
  };

  const toggleTeslim = async (note) => {
    try {
      const res = await fetch(`${API_BASE}/musteri_emanetler/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...note, teslim_edildi_mi: !note.teslim_edildi_mi })
      });
      if (!res.ok) throw new Error('Güncellenemedi');
      addToast('Başarılı', 'Durum güncellendi', 'success');
      fetchEmanetler();
    } catch (err) {
      addToast('Hata', err.message, 'error');
    }
  };

  const handleDeleteNote = async (id) => {
    if (!window.confirm("Bu notu silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`${API_BASE}/musteri_emanetler/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Silinemedi');
      addToast('Başarılı', 'Not silindi', 'success');
      fetchEmanetler();
    } catch (err) {
      addToast('Hata', err.message, 'error');
    }
  };

  const openEditCustomerModal = () => {
    if (!activeCustomer) return;
    setEditCustomerFormData({
      old_name: activeCustomer.name,
      musteri_adi: activeCustomer.name,
      telefon: activeCustomer.telefon
    });
    setIsEditCustomerModalOpen(true);
  };

  const openEditNoteModal = (note) => {
    setEditNoteFormData({
      id: note.id,
      musteri_adi: note.musteri_adi,
      telefon: note.telefon || '',
      not_detayi: note.not_detayi,
      teslim_edildi_mi: note.teslim_edildi_mi,
      kategori: note.kategori || 'Genel'
    });
    setIsEditNoteModalOpen(true);
  };

  // Get initials for customer avatar
  const getInitials = (name) => {
    if (!name) return 'M';
    const parts = name.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Render category badges with distinct premium colors
  const getCategoryBadge = (category) => {
    switch (category) {
      case 'Emanet':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">Emanet</span>;
      case 'Finans':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Tahsilat / Finans</span>;
      case 'Borc':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">Borç / Alacak</span>;
      case 'Tamir':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">Tamir / Tadilat</span>;
      case 'Genel':
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-ink-100 text-ink-800 border border-ink-200">Genel Not</span>;
    }
  };

  // Adapt status language according to note category
  const getStatusInfo = (note) => {
    const isCompleted = note.teslim_edildi_mi;
    const isPhysical = note.kategori === 'Emanet' || note.kategori === 'Tamir';
    
    if (isPhysical) {
      return {
        label: isCompleted ? 'Teslim Edildi' : 'Bekliyor',
        colorClass: isCompleted ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-amber-100 text-amber-800 hover:bg-amber-200',
      };
    } else {
      return {
        label: isCompleted ? 'Tamamlandı' : 'Aktif',
        colorClass: isCompleted ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200' : 'bg-sky-100 text-sky-800 hover:bg-sky-200',
      };
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-ink-200 premium-shadow">
        <div>
          <h1 className="text-2xl font-black text-ink-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
              <Notebook size={24} />
            </div>
            Müşteriler & Emanetler
          </h1>
          <p className="text-ink-500 mt-2">Müşterilerden gelen emanetleri, finans notlarını veya genel notları yönetin.</p>
        </div>
        <button 
          onClick={() => setIsCustomerModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold transition-colors shadow-sm"
        >
          <Plus size={20} /> Yeni Müşteri Ekle
        </button>
      </div>

      {/* Main Grid: Master-Detail Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Side: Customers list (md:col-span-5) */}
        <div className={`space-y-4 md:col-span-5 ${selectedCustomerName ? 'hidden md:block' : 'block'}`}>
          {/* Search bar */}
          <div className="bg-white p-4 rounded-xl border border-ink-200 premium-shadow">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-ink-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-ink-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm outline-none"
                placeholder="Müşteri adı, kategori veya not ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Customer list container */}
          <div className="bg-white rounded-xl border border-ink-200 overflow-hidden premium-shadow max-h-[600px] overflow-y-auto divide-y divide-ink-100">
            {loading && emanetler.length === 0 ? (
              <div className="p-8 text-center text-ink-500">Yükleniyor...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-ink-500">Kayıt bulunamadı.</div>
            ) : (
              filteredCustomers.map(customer => {
                const isSelected = selectedCustomerName === customer.name;
                const initials = getInitials(customer.name);
                return (
                  <div 
                    key={customer.name}
                    onClick={() => setSelectedCustomerName(customer.name)}
                    className={`flex items-center justify-between p-4 cursor-pointer transition-all hover:bg-ink-50/50 ${
                      isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        isSelected 
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' 
                          : 'bg-gradient-to-tr from-indigo-100 to-purple-100 text-indigo-700'
                      }`}>
                        {initials}
                      </div>
                      
                      <div>
                        <div className="font-bold text-ink-900 leading-tight">{customer.name}</div>
                        {customer.telefon ? (
                          <div className="flex items-center gap-1 text-xs text-ink-500 mt-1">
                            <Phone size={12} />
                            <span>{customer.telefon}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-ink-400 mt-1 italic">Telefon yok</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {customer.pendingCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          {customer.pendingCount} Aktif / Bekliyor
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          Kapandı
                        </span>
                      )}
                      <ChevronRight size={18} className="text-ink-400" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Selected Customer Details (md:col-span-7) */}
        <div className={`md:col-span-7 ${selectedCustomerName ? 'block' : 'hidden md:block'}`}>
          {activeCustomer ? (
            <div className="bg-white rounded-xl border border-ink-200 premium-shadow overflow-hidden space-y-6 p-6">
              {/* Back button on mobile */}
              <button 
                onClick={() => setSelectedCustomerName(null)}
                className="md:hidden flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-bold mb-4"
              >
                <ArrowLeft size={16} /> Müşteri Listesine Dön
              </button>

              {/* Customer Profile Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-ink-150">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xl font-black shadow-md">
                    {getInitials(activeCustomer.name)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-900 leading-tight">{activeCustomer.name}</h2>
                    {activeCustomer.telefon ? (
                      <div className="flex items-center gap-1.5 text-ink-600 mt-1 font-medium">
                        <Phone size={14} className="text-ink-400" />
                        <span>{activeCustomer.telefon}</span>
                      </div>
                    ) : (
                      <span className="text-ink-400 text-sm italic block mt-1">Telefon numarası belirtilmemiş</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={openEditCustomerModal}
                    className="flex items-center gap-1.5 border border-ink-200 bg-ink-50 hover:bg-ink-100 text-ink-700 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    <Edit2 size={16} /> Düzenle
                  </button>
                  <button 
                    onClick={() => setIsNoteModalOpen(true)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm"
                  >
                    <Plus size={16} /> Not Ekle
                  </button>
                </div>
              </div>

              {/* Notes / Emanets List */}
              <div className="space-y-4">
                <h3 className="font-bold text-ink-800 text-sm tracking-wide uppercase">Müşterinin Not ve Emanetleri</h3>
                
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {activeCustomer.notes.map((note) => {
                    const statusInfo = getStatusInfo(note);
                    return (
                      <div 
                        key={note.id}
                        className={`p-4 rounded-xl border transition-all ${
                          note.teslim_edildi_mi 
                            ? 'bg-ink-50/50 border-ink-200 opacity-75' 
                            : 'bg-white border-indigo-200 shadow-sm shadow-indigo-50/30'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Category Badge */}
                            {getCategoryBadge(note.kategori)}
                            
                            {/* Status Toggle Badge */}
                            <button 
                              onClick={() => toggleTeslim(note)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors ${statusInfo.colorClass}`}
                            >
                              {note.teslim_edildi_mi ? <CheckCircle size={12} /> : <Clock size={12} />}
                              {statusInfo.label}
                            </button>
                          </div>

                          <div className="text-xs text-ink-400 font-mono">
                            {new Date(note.olusturulma_tarihi).toLocaleDateString('tr-TR')}
                          </div>
                        </div>

                        {/* Note detail content */}
                        <p className="text-ink-800 text-sm font-medium whitespace-pre-wrap leading-relaxed">
                          {note.not_detayi}
                        </p>

                        {/* Deliver Date or Action Buttons */}
                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-ink-100">
                          <div className="text-xs font-bold">
                            {note.teslim_edildi_mi && note.teslim_tarihi ? (
                              <span className="text-emerald-600">
                                Tamamlanma/Teslim: {new Date(note.teslim_tarihi).toLocaleDateString('tr-TR')}
                              </span>
                            ) : (
                              <span className="text-ink-400 italic font-medium">İşlem / Teslimat Bekliyor</span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button 
                              onClick={() => openEditNoteModal(note)}
                              className="p-1.5 text-indigo-600 hover:text-indigo-900 rounded hover:bg-indigo-50 transition-colors"
                              title="Notu Düzenle"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1.5 text-rose-600 hover:text-rose-900 rounded hover:bg-rose-50 transition-colors"
                              title="Notu Sil"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-ink-50/50 rounded-xl border border-dashed border-ink-300 p-12 text-center text-ink-500 premium-shadow">
              <div className="w-16 h-16 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-4">
                <Users size={32} />
              </div>
              <h3 className="text-lg font-bold text-ink-800">Müşteri Detay Ekranı</h3>
              <p className="max-w-xs mx-auto mt-2 text-sm text-ink-500">
                Notları, emanetleri ve işlem detaylarını görüntülemek için sol taraftaki listeden bir müşteri seçin.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add Customer and Note */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-ink-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-ink-900">Yeni Müşteri Ekle</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="text-ink-400 hover:text-ink-600"><XCircle size={24} /></button>
            </div>
            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Müşteri Adı</label>
                <input required type="text" className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={customerFormData.musteri_adi} onChange={e => setCustomerFormData({...customerFormData, musteri_adi: e.target.value})} placeholder="Örn: Ahmet Yılmaz" />
              </div>
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Telefon (Opsiyonel)</label>
                <input type="text" className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={customerFormData.telefon} onChange={e => setCustomerFormData({...customerFormData, telefon: e.target.value})} placeholder="05XX XXX XX XX" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-ink-700 mb-1">İşlem / Not Kategorisi</label>
                  <select 
                    className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-bold text-ink-700 cursor-pointer"
                    value={customerFormData.kategori}
                    onChange={e => setCustomerFormData({...customerFormData, kategori: e.target.value})}
                  >
                    <option value="Genel">Genel Not</option>
                    <option value="Emanet">Emanet / Teslimat</option>
                    <option value="Finans">Tahsilat / Finans (Para vb.)</option>
                    <option value="Borc">Borç / Alacak</option>
                    <option value="Tamir">Tamir / Tadilat</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">İlk Not / İşlem Detayı (Opsiyonel)</label>
                <textarea className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]" value={customerFormData.not_detayi} onChange={e => setCustomerFormData({...customerFormData, not_detayi: e.target.value})} placeholder="Örn: 5000 Dolar teslim alındı / emanet bırakıldı..."></textarea>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="px-4 py-2 font-bold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-lg">İptal</button>
                <button type="submit" className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Note to Existing Customer */}
      {isNoteModalOpen && activeCustomer && (
        <div className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-ink-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-ink-900">{activeCustomer.name} için Not Ekle</h3>
              <button onClick={() => setIsNoteModalOpen(false)} className="text-ink-400 hover:text-ink-600"><XCircle size={24} /></button>
            </div>
            <form onSubmit={handleCreateNote} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Not / İşlem Kategorisi</label>
                <select 
                  className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-bold text-ink-700 cursor-pointer"
                  value={noteFormData.kategori}
                  onChange={e => setNoteFormData({...noteFormData, kategori: e.target.value})}
                >
                  <option value="Genel">Genel Not</option>
                  <option value="Emanet">Emanet / Teslimat</option>
                  <option value="Finans">Tahsilat / Finans (Para vb.)</option>
                  <option value="Borc">Borç / Alacak</option>
                  <option value="Tamir">Tamir / Tadilat</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Not / İşlem Detayı</label>
                <textarea required className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]" value={noteFormData.not_detayi} onChange={e => setNoteFormData({...noteFormData, not_detayi: e.target.value})} placeholder="Örn: 5000 Dolar ödeme yapıldı..."></textarea>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="add_teslim" className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" checked={noteFormData.teslim_edildi_mi} onChange={e => setNoteFormData({...noteFormData, teslim_edildi_mi: e.target.checked})} />
                <label htmlFor="add_teslim" className="text-sm font-bold text-ink-700 select-none cursor-pointer">
                  {noteFormData.kategori === 'Emanet' || noteFormData.kategori === 'Tamir' ? 'Teslim Edildi Olarak Kaydet' : 'Tamamlandı Olarak Kaydet'}
                </label>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 font-bold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-lg">İptal</button>
                <button type="submit" className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Not Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Customer Details */}
      {isEditCustomerModalOpen && (
        <div className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-ink-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-ink-900">Müşteri Bilgilerini Güncelle</h3>
              <button onClick={() => setIsEditCustomerModalOpen(false)} className="text-ink-400 hover:text-ink-600"><XCircle size={24} /></button>
            </div>
            <form onSubmit={handleUpdateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Müşteri Adı</label>
                <input required type="text" className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={editCustomerFormData.musteri_adi} onChange={e => setEditCustomerFormData({...editCustomerFormData, musteri_adi: e.target.value})} placeholder="Ad Soyad" />
              </div>
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Telefon</label>
                <input type="text" className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={editCustomerFormData.telefon} onChange={e => setEditCustomerFormData({...editCustomerFormData, telefon: e.target.value})} placeholder="Telefon numarası" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsEditCustomerModalOpen(false)} className="px-4 py-2 font-bold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-lg">İptal</button>
                <button type="submit" className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Güncelle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Note Details */}
      {isEditNoteModalOpen && (
        <div className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-ink-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-ink-900">Notu Düzenle</h3>
              <button onClick={() => setIsEditNoteModalOpen(false)} className="text-ink-400 hover:text-ink-600"><XCircle size={24} /></button>
            </div>
            <form onSubmit={handleUpdateNote} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Not / İşlem Kategorisi</label>
                <select 
                  className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-bold text-ink-700 cursor-pointer"
                  value={editNoteFormData.kategori}
                  onChange={e => setEditNoteFormData({...editNoteFormData, kategori: e.target.value})}
                >
                  <option value="Genel">Genel Not</option>
                  <option value="Emanet">Emanet / Teslimat</option>
                  <option value="Finans">Tahsilat / Finans (Para vb.)</option>
                  <option value="Borc">Borç / Alacak</option>
                  <option value="Tamir">Tamir / Tadilat</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-ink-700 mb-1">Not / İşlem Detayı</label>
                <textarea required className="w-full p-2.5 border border-ink-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px]" value={editNoteFormData.not_detayi} onChange={e => setEditNoteFormData({...editNoteFormData, not_detayi: e.target.value})} placeholder="Not içeriği..."></textarea>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="edit_teslim" className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" checked={editNoteFormData.teslim_edildi_mi} onChange={e => setEditNoteFormData({...editNoteFormData, teslim_edildi_mi: e.target.checked})} />
                <label htmlFor="edit_teslim" className="text-sm font-bold text-ink-700 select-none cursor-pointer">
                  {editNoteFormData.kategori === 'Emanet' || editNoteFormData.kategori === 'Tamir' ? 'Teslim Edildi' : 'Tamamlandı'}
                </label>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsEditNoteModalOpen(false)} className="px-4 py-2 font-bold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-lg">İptal</button>
                <button type="submit" className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
