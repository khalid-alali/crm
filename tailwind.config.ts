import type { Config } from 'tailwindcss'

/** Fixlane palette: Onix Black, Violet Blue, Arctic White (+ supporting shades). */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        onix: {
          300: '#CACACD',
          400: '#9B9C9F',
          600: '#6D6E70',
          800: '#3E4042',
          950: '#0F1114',
        },
        arctic: {
          50: '#F9F9FB',
          100: '#E7E8EC',
          200: '#D4D7D0',
          300: '#C3C7CC',
          400: '#B0B6BD',
        },
        brand: {
          50: '#F3F5FE',
          100: '#DCE0FB',
          200: '#BFC7FB',
          300: '#A2AEF9',
          400: '#8595F9',
          500: '#687CF9',
          600: '#687CF9',
          700: '#5568E6',
          800: '#4a5bd4',
        },
      },
    },
  },
  plugins: [],
}

export default config
