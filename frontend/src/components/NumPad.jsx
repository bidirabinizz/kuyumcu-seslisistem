import { Delete } from 'lucide-react';

/**
 * Dokunmatik numpad — tablet için büyük butonlar
 * Props:
 *   value: string
 *   onChange: (val: string) => void
 *   decimal?: boolean  (varsayılan true — ondalık giriş izni)
 *   maxLen?: number
 */
export function NumPad({ value = '', onChange, decimal = true, maxLen = 10 }) {
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
            onPointerDown={(e) => { e.preventDefault(); handleKey(key); }}
            className={`
              h-14 rounded-2xl font-bold text-xl transition-all active:scale-95 select-none
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
