/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        // Laranja do portal da SECONSER. Nos textos usar 700+ (contraste AA).
        marca: {
          50: '#fdf3ec', 100: '#fbe3d2', 200: '#f6c4a2', 300: '#f09f6c',
          400: '#eb8248', 500: '#e8712f', 600: '#d05d1f', 700: '#ad4a18',
          800: '#8a3c18', 900: '#703317',
        },
        // Rodapé cinza-escuro do portal.
        rodape: { DEFAULT: '#4b4b4b', escuro: '#424242' },
      },
    },
  },
  plugins: [],
};
