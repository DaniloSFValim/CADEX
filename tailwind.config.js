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
        // Mesma paleta do NETRANK RJ (mesma autoria, mesma família visual).
        // Cada cor tem função fixa; nada é decorativo.
        // Petróleo: ação, navegação, links. Texto sobre branco: 600+.
        marca: {
          50: '#eef6f6', 100: '#dcedee', 200: '#bfdcde', 300: '#8fc1c6',
          400: '#3d8f9a', 500: '#0e7482', 600: '#0b6572', 700: '#0b5b68',
          800: '#0a4f5b', 900: '#08404a',
        },
        // Grafite: papel (50), linhas (200), texto (500–900).
        tinta: {
          50: '#f3f5f4', 100: '#e1e6e8', 200: '#cdd4d8', 300: '#a3acb4',
          400: '#66717c', 500: '#56626e', 600: '#44515e', 700: '#2e3a46',
          800: '#1f2a35', 900: '#141d26',
        },
        // Situação da inscrição.
        alta: '#1e7b4c',
        baixa: '#b3372c',
        atencao: '#8f5b00',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
