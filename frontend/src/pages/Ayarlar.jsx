import React, { useState } from 'react';
import NetworkInfo from '../components/NetworkInfo';
import { Settings, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { API_BASE } from '../apiConfig';

function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const { addToast } = useToast();
  const email = localStorage.getItem('adminEmail') || 'admin@caparkuyumculuk.com';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      addToast('Lütfen tüm alanları doldurun.', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast('Yeni şifreler eşleşmiyor.', 'error');
      return;
    }

    if (newPassword.length < 4) {
      addToast('Şifre en az 4 karakter olmalıdır.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || 'Şifre değiştirilemedi');
      }

      addToast('Şifreniz başarıyla güncellendi.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-ink-150 rounded-3xl p-6 shadow-md shadow-ink-900/5">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-ink-600 uppercase tracking-wider block">
            Mevcut Şifre
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              required
              placeholder="Mevcut şifrenizi girin"
              className="w-full bg-ink-50 border border-ink-200 focus:border-gold-500 rounded-2xl pl-10 pr-12 py-3 text-sm font-semibold text-ink-900 outline-none transition-all"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">
              <Lock size={16} />
            </span>
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 transition-colors"
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-ink-600 uppercase tracking-wider block">
            Yeni Şifre
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              required
              placeholder="Yeni şifrenizi girin"
              className="w-full bg-ink-50 border border-ink-200 focus:border-gold-500 rounded-2xl pl-10 pr-12 py-3 text-sm font-semibold text-ink-900 outline-none transition-all"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">
              <Lock size={16} />
            </span>
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 transition-colors"
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-ink-600 uppercase tracking-wider block">
            Yeni Şifre (Tekrar)
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              required
              placeholder="Yeni şifrenizi tekrar girin"
              className="w-full bg-ink-50 border border-ink-200 focus:border-gold-500 rounded-2xl pl-10 pr-12 py-3 text-sm font-semibold text-ink-900 outline-none transition-all"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">
              <Lock size={16} />
            </span>
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 transition-colors"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-ink-900 hover:bg-gold-500 text-white hover:text-gray-950 font-black text-xs tracking-wider uppercase rounded-2xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            <>
              <CheckCircle2 size={14} />
              Şifreyi Güncelle
            </>
          )}
        </button>
      </form>
    </div>
  );
}

const Ayarlar = () => {
  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-yellow-600/20 rounded-xl">
          <Settings className="text-yellow-500 w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-black tracking-tight">Sistem Ayarları</h1>
          <p className="text-gray-400 text-sm">Cihaz bağlantıları ve teknik yapılandırmalar</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Bağlantı Bilgileri Bölümü */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-ink-900/90 border-b border-ink-100 pb-2">
            Mobil Bağlantı
          </h2>
          <NetworkInfo />
        </div>

        {/* Şifre Değiştirme Bölümü */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-ink-900/90 border-b border-ink-100 pb-2">
            Güvenlik Ayarları
          </h2>
          <PasswordChangeForm />
        </div>
      </div>
    </div>
  );
};

export default Ayarlar;