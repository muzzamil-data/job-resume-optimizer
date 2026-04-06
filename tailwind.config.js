/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./popup.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1152d4',
          50:  '#eef3fd',
          100: '#d9e4fb',
          200: '#b3c9f7',
          300: '#7fa5f0',
          400: '#4d7ee9',
          500: '#1152d4',
          600: '#0e43b0',
          700: '#0b338c',
          800: '#082468',
          900: '#051744',
        }
      }
    },
  },
  plugins: [],
}
