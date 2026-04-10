export const StatCard = ({ label, value, unit, sub, icon: Icon, color = 'gold', trend }) => {
  const colors = {
    gold:    { bg: 'bg-gold-50',    border: 'border-gold-100',    icon: 'bg-gold-100 text-gold-700',    val: 'text-gold-800'  },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'bg-emerald-100 text-emerald-700', val: 'text-emerald-800' },
    red:     { bg: 'bg-red-50',     border: 'border-red-100',     icon: 'bg-red-100 text-red-700',     val: 'text-red-800'   },
    ink:     { bg: 'bg-ink-50',     border: 'border-ink-100',     icon: 'bg-ink-100 text-ink-700',     val: 'text-ink-800'   },
  };
  const c = colors[color];

  return (
    <div className={`stat-card ${c.bg} border ${c.border} rounded-2xl p-5`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${c.icon} flex items-center justify-center`}>
          <Icon size={18} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${trend >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-black font-display ${c.val}`}>{value}</span>
        {unit && <span className="text-sm text-ink-400 font-medium">{unit}</span>}
      </div>
      {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
    </div>
  );
};
