/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        ink: {
          50:  '#F8F7F4',
          100: '#EEECEA',
          200: '#D5D2CC',
          300: '#B0ACA4',
          400: '#857F76',
          500: '#5C5750',
          600: '#3D3933',
          700: '#2A2722',
          800: '#1A1814',
          900: '#0E0D0B',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        pulse_gold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(245,158,11,0.4)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(245,158,11,0)' },
        },
        fadeUp: {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
        ticker: {
          from: { transform: 'translateY(0)' },
          to:   { transform: 'translateY(-50%)' },
        },
        fadeIn: {
        '0%': { opacity: '0', transform: 'translateY(10px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer:    'shimmer 2.5s linear infinite',
        pulse_gold: 'pulse_gold 2s ease-in-out infinite',
        fadeUp:     'fadeUp 0.4s ease forwards',
        ticker:     'ticker 12s linear infinite',
        fadeIn: 'fadeIn 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
};
