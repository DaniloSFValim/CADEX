/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta institucional sóbria (§39: "cores sem excesso").
        gov: {
          50: '#f2f6fa', 100: '#e3ecf5', 200: '#c2d6e9', 300: '#93b5d6',
          400: '#5d8dbd', 500: '#3a6da2', 600: '#2b5687', 700: '#24466d',
          800: '#1f3a5a', 900: '#1c314b',
        },
      },
    },
  },
  plugins: [],
};
