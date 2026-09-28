/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Public Sans: desenhada para interfaces de serviço público; algarismos
        // tabulares para CNPJ, códigos e datas.
        sans: ['"Public Sans Variable"', 'Public Sans', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        // Lora: serif para headlines, confere autoridade institucional
        serif: ['"Lora"', 'Georgia', 'serif'],
      },
      colors: {
        // Paleta atualizada: Azul profundo + Laranja (identidade premium)
        // Azul: autoridade, confiança, instituição
        primary: {
          50: '#e3f0fa', 100: '#c7e1f5', 200: '#8fbfea', 300: '#5a9cde',
          400: '#2d7fcf', 500: '#0D3B66', 600: '#0A2A4A', 700: '#08213A',
          800: '#051729', 900: '#03101A',
        },
        // Laranja: urgência, ação, obrigatoriedade
        accent: {
          50: '#fff8f0', 100: '#ffe8cc', 200: '#ffd699', 300: '#ffc266',
          400: '#ffb233', 500: '#F77F00', 600: '#cc6600', 700: '#994d00',
          800: '#663300', 900: '#331900',
        },
        // Marca: mantida para retrocompatibilidade
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
        // Situação da inscrição (semântica)
        alta: '#06A77D',      // Verde: sucesso, ativa
        baixa: '#D62828',     // Vermelho: crítico, vencida
        atencao: '#F0AD4E',   // Amarelo: atenção, renovação próxima
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
