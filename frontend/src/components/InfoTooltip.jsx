import React from 'react';
import { Info } from 'lucide-react';

export const InfoTooltip = ({ text, position = 'top' }) => {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative inline-block group ml-1.5 align-middle select-none shrink-0">
      <Info 
        size={13} 
        className="text-ink-400 hover:text-gold-600 transition-colors cursor-help shrink-0" 
      />
      <div 
        className={`absolute z-[9999] hidden group-hover:block w-52 bg-ink-900 text-white text-[10px] font-medium p-2.5 rounded border border-ink-700 shadow-2xl pointer-events-none leading-relaxed transition-all duration-200 ${positionClasses[position]}`}
      >
        {text}
        {/* Tooltip Arrow */}
        <div 
          className={`absolute w-1.5 h-1.5 bg-ink-900 border-ink-700 rotate-45 ${
            position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -translate-y-1 border-r border-b' :
            position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 translate-y-1 border-l border-t' :
            position === 'left' ? 'left-full top-1/2 -translate-x-1 -translate-y-1/2 border-r border-t' :
            'right-full top-1/2 translate-x-1 -translate-y-1/2 border-l border-b'
          }`} 
        />
      </div>
    </div>
  );
};
