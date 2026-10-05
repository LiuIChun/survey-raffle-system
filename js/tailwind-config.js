tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff5f5',
          100: '#ffe3e3',
          500: '#ff6b6b',
          600: '#fa5252',
          700: '#e03131',
        },
        vibrant: {
          amber: '#fcc419',
          orange: '#ff922b',
          teal: '#20c997',
          purple: '#845ef7'
        }
      },
      animation: {
        'glow': 'glow 1.5s ease-in-out infinite alternate',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 15px rgba(255, 107, 107, 0.3)' },
          '100%': { boxShadow: '0 0 35px rgba(252, 196, 25, 0.6)' },
        }
      }
    }
  }
}
