import { createContext, useContext, useCallback, useRef, useState } from 'react';

// ─── Context ────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast: ToastProvider dışında kullanılamaz');
  return ctx;
}

// ─── Toast Tipleri ─────────────────────────────────────────────────────────
const ICONS = {
  error:   '❌',
  warning: '⚠️',
  success: '✅',
  info:    'ℹ️',
};

const COLORS = {
  error:   { bg: 'rgba(127,29,29,0.92)', border: 'rgba(239,68,68,0.5)' },
  warning: { bg: 'rgba(120,53,15,0.92)', border: 'rgba(245,158,11,0.5)' },
  success: { bg: 'rgba(6,78,59,0.92)',   border: 'rgba(52,211,153,0.5)' },
  info:    { bg: 'rgba(15,23,42,0.95)',   border: 'rgba(148,163,184,0.4)' },
};

// ─── Provider ──────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = useCallback((message, type = 'error', duration = 5000) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast Konteyneri */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
        maxWidth: 380,
      }}>
        {toasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  const { bg, border } = COLORS[toast.type] || COLORS.info;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: '12px 16px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
        animation: 'toastIn 0.25s ease-out',
        maxWidth: 380,
        wordBreak: 'break-word',
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
        {ICONS[toast.type] || ICONS.info}
      </span>
      <p style={{
        margin: 0,
        color: '#f1f5f9',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.5,
        flex: 1,
      }}>
        {toast.message}
      </p>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.4)',
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 0 0 4px',
          flexShrink: 0,
          lineHeight: 1,
        }}
        aria-label="Kapat"
      >×</button>
    </div>
  );
}
