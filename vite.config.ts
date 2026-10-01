import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mesmo repasse do vercel.json, para o cruzamento com a Anatel em desenvolvimento.
    proxy: {
      '/anatel/niteroi.json': {
        target: 'https://netranking-rj.labdados.org', changeOrigin: true,
        rewrite: () => '/data/municipios/niteroi.json',
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
