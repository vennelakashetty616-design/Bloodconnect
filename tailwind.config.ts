import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        red: {
          50:  '#FFF3F5',
          100: '#FBDDE2',
          200: '#F5B5C1',
          300: '#EC8599',
          400: '#E25572',
          500: '#D83957',
          600: '#C62828',
          700: '#B11226',
          800: '#910E20',
          900: '#6F0B18',
          950: '#46070F',
        },
        blood: {
          50:  '#FFF3F5',
          100: '#FBDDE2',
          200: '#F5B5C1',
          300: '#EC8599',
          400: '#E25572',
          500: '#D83957',
          600: '#C62828',
          700: '#B11226',
          800: '#910E20',
          900: '#6F0B18',
          950: '#46070F',
        },
        trust: {
          50: '#FFF9ED',
          100: '#FFEFCF',
          200: '#FFE09F',
          300: '#FFD070',
          400: '#F2B850',
          500: '#E39D34',
          600: '#C27E1E',
          700: '#9A6117',
          800: '#7B4D13',
          900: '#603B0F',
          950: '#3B2409',
        },
        care: {
          50: '#FFF4F5',
          100: '#FFE2E5',
          200: '#FFC6CD',
          300: '#FF9EAB',
          400: '#F36F82',
          500: '#E25572',
          600: '#C93A58',
          700: '#A82B47',
          800: '#85233A',
          900: '#661B2D',
        },
        neutral: {
          offwhite: '#F6FBF8',
          mist: '#EEF6F1',
        },
        score: {
          low: '#F4A261',
          medium: '#3A86FF',
          high: '#2A9D8F',
        },
        crimson: '#B11226',
        heartRed: '#C62828',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        heartbeat: 'heartbeat 1s ease-in-out infinite',
        'heartbeat-fast': 'heartbeat 0.5s ease-in-out infinite',
        'pulse-red': 'pulseRed 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'ripple': 'ripple 1.5s linear infinite',
        'emergency-pulse': 'emergencyPulse 0.8s ease-in-out infinite',
        'donor-ping': 'donorPing 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      keyframes: {
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '14%': { transform: 'scale(1.2)' },
          '28%': { transform: 'scale(1)' },
          '42%': { transform: 'scale(1.15)' },
          '70%': { transform: 'scale(1)' },
        },
        pulseRed: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        ripple: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        emergencyPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(220, 38, 38, 0.7)' },
          '50%': { boxShadow: '0 0 0 12px rgba(220, 38, 38, 0)' },
        },
        donorPing: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'blood': '0 4px 24px rgba(177, 18, 38, 0.3)',
        'blood-lg': '0 8px 48px rgba(177, 18, 38, 0.4)',
        'trust': '0 8px 32px rgba(194, 126, 30, 0.22)',
        'care': '0 8px 32px rgba(201, 58, 88, 0.2)',
        'card': '0 2px 16px rgba(0,0,0,0.08)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.14)',
      },
    },
  },
  plugins: [],
}
export default config
