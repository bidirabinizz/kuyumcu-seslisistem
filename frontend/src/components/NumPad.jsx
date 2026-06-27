import { Delete } from 'lucide-react';

import { useRef, useCallback } from 'react';

/**
 * Dokunmatik numpad — tablet için büyük butonlar
 * Props:
 *   value: string
 *   onChange: (val: string) => void
 *   decimal?: boolean  (varsayılan true — ondalık giriş izni)
 *   maxLen?: number
 */
export function NumPad({ value = '', onChange, decimal = true, maxLen = 10 }) {
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);

  const stopDeleteTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const handleDelete = useCallback((currentVal) => {
    return currentVal.slice(0, -1);
  }, []);
  const handleKey = (key) => {
    if (key === 'DEL') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === '.' && (!decimal || value.includes('.'))) return;
    if (key === '.' && value === '') { onChange('0.'); return; }
    if (value.length >= maxLen) return;
    onChange(value + key);
  };

  const handlePointerDown = (e, key) => {
    e.preventDefault();
    if (key === 'DEL') {
      // Anında bir kez sil
      onChange(prev => handleDelete(prev));
      // Basılı tutmayı algılamak için bekle
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          onChange(prev => handleDelete(prev));
        }, 70); // 70ms aralıklarla hızlıca sil
      }, 400); // 400ms basılı tutulursa hızlı silmeye başla
    } else {
      handleKey(key);
    }
  };

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    [decimal ? '.' : '', '0', 'DEL'],
  ];

  return (
    <div className="grid grid-cols-3 gap-2 select-none">
      {keys.flat().map((key, i) => {
        if (!key) return <div key={i} />;
        const isDel = key === 'DEL';
        return (
          <button
            key={i}
            type="button"
            onPointerDown={(e) => handlePointerDown(e, key)}
            onPointerUp={isDel ? stopDeleteTimer : undefined}
            onPointerLeave={isDel ? stopDeleteTimer : undefined}
            onContextMenu={(e) => e.preventDefault()} // Sağ tık menüsünü engelle
            className={`
              h-14 rounded-2xl font-bold text-xl transition-all active:scale-95 select-none touch-none
              ${isDel
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 flex items-center justify-center'
                : 'bg-gray-800 text-white hover:bg-gray-700'}
            `}
          >
            {isDel ? <Delete size={20} /> : key}
          </button>
        );
      })}
    </div>
  );
}
