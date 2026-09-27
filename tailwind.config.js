/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Public Sans: desenhada para interfaces de serviço público; algarismos
        // tabulares para CNPJ, códigos e datas.
        sans: ['"Public Sans Variable"', 'Public Sans', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        // Laranja institucional de Niterói: só como destaque (botão principal,
        // item ativo, links). Em texto sobre branco, usar 700+ (contraste AA).
        marca: {
          50: '#fdf3ec', 100: '#fbe3d2', 200: '#f6c4a2', 300: '#f09f6c',
          400: '#eb8248', 500: '#e8712f', 600: '#d05d1f', 700: '#ad4a18',
          800: '#8a3c18', 900: '#703317',
        },
        // Grafite da estrutura (barra do governo e rodapé) e do texto.
        tinta: {
          50: '#f5f6f8', 100: '#eceef2', 200: '#d9dde4', 300: '#b8bfcb',
          400: '#8a94a6', 500: '#5f6b7e', 600: '#465163', 700: '#343d4d',
          800: '#252c38', 900: '#1b212b',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
