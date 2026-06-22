import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { API_BASE } from '../apiConfig';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      addToast('Lütfen tüm alanları doldurun.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || 'E-posta veya şifre hatalı');
      }

      addToast('Giriş başarılı. Yönlendiriliyorsunuz...', 'success');
      localStorage.setItem('adminLoggedIn', 'true');
      localStorage.setItem('adminEmail', result.email);
      
      // Delay navigation slightly to let toast be seen
      setTimeout(() => {
        navigate('/');
      }, 1000);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-screen w-screen h-screen bg-[#07090e] bg-gradient-to-br from-[#07090e] via-[#0d131f] to-[#1a120b]/30 flex items-center justify-center p-4 overflow-hidden relative">
      {/* Decorative background blur objects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gold-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Header */}
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-xl shadow-gold-500/20">
            <ShieldCheck size={28} className="text-gray-950 animate-pulse" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="font-display font-black text-2xl tracking-wider text-white">ÇAPAR ERP</h1>
            <p className="text-xs font-mono text-gold-500 tracking-[0.25em] uppercase mt-1">Yönetici Girişi</p>
          </div>
        </div>

        {/* Card */}
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                E-posta Adresi
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="admin@caparkuyumculuk.com"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-semibold text-white placeholder-gray-600 outline-none focus:border-gold-500 focus:bg-white/[0.07] transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                  <Mail size={18} />
                </span>
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                Yönetici Şifresi
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-12 py-3.5 text-sm font-semibold text-white placeholder-gray-600 outline-none focus:border-gold-500 focus:bg-white/[0.07] transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                  <Lock size={18} />
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-gray-950 font-black text-sm tracking-widest uppercase rounded-2xl shadow-lg shadow-gold-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Kontrol Ediliyor...
                </>
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[10px] text-gray-600 font-mono mt-8">
          Çapar Kuyumculuk ERP Sistemi © 2026
        </p>
      </div>
    </div>
  );
}
