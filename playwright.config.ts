import { defineConfig } from '@playwright/test';

/**
 * Testes de tela: abrem a aplicação de verdade no navegador, com o Supabase
 * simulado por interceptação de rede (e2e/apoio/backend.ts). Não tocam em
 * nenhum banco: servem para pegar o que os testes de unidade e do banco não
 * enxergam (fluxo do formulário, filtros, rotas, estouro de largura).
 *
 * Localmente: `npm run test:e2e`. Se o navegador do Playwright não estiver
 * instalado, aponte um Chromium existente em CHROMIUM_PATH.
 */
const PORTA = 5199;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    viewport: { width: 1280, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] }
      : {},
  },
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Um endereço de Supabase que ninguém atende: tudo passa pelo simulado.
    env: { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'e2e' },
  },
});
