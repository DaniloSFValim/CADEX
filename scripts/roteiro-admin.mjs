// Roteiro de teste do painel administrativo da CADEX. SOMENTE LEITURA: entra, navega e
// tira capturas. Não clica em ações, não altera registros.
//
// Como rodar (na sua máquina, com Node 22+ e Playwright instalado):
//   export CADEX_EMAIL="seu-email"
//   export CADEX_SENHA="sua-senha"          (só na sua máquina; nunca no chat)
//   node roteiro-admin.mjs                   (pede o código do autenticador no terminal)
//   CADEX_URL=https://... node roteiro-admin.mjs   (opcional; padrão: produção)
//
// Saída: pasta ./relatorio-admin/ com capturas e relatorio.json. Envie o relatorio.json
// e as capturas de volta. O script não grava credenciais em nenhum lugar.

import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.CADEX_URL || 'https://cadex-niteroi.vercel.app';
const EMAIL = process.env.CADEX_EMAIL;
const SENHA = process.env.CADEX_SENHA;
if (!EMAIL || !SENHA) {
  console.error('Defina CADEX_EMAIL e CADEX_SENHA no ambiente antes de rodar.');
  process.exit(1);
}

const SAIDA = join(process.cwd(), 'relatorio-admin');
mkdirSync(SAIDA, { recursive: true });

// Telas administrativas a percorrer (somente leitura).
const TELAS = [
  ['dashboard', '/dashboard'],
  ['dashboard-pendencias', '/dashboard/pendencias'],
  ['dashboard-registros', '/dashboard/registros'],
  ['empresas', '/empresas'],
  ['obras', '/obras'],
  ['obras-sem-licenca', '/obras/sem-licenca'],
  ['anatel', '/anatel'],
  ['admin-empresas', '/admin/empresas'],
  ['admin-licencas', '/admin/licencas'],
  ['admin-manutencao', '/admin/manutencao'],
  ['admin-tipos', '/admin/tipos'],
  ['admin-orgaos', '/admin/orgaos'],
  ['admin-configuracoes', '/admin/configuracoes'],
  ['admin-auditoria', '/admin/auditoria'],
  ['admin-contas', '/admin/contas'],
  ['minha-conta', '/minha-conta'],
];

const rl = createInterface({ input: process.stdin, output: process.stdout });
const browser = await chromium.launch();
const resultados = [];

const pagina = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const erros = [];
pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.message.slice(0, 160)}`));
pagina.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text().slice(0, 160)}`); });

for (const [largura, altura, nome] of [[1440, 900, 'desktop'], [390, 844, 'celular']]) {
  await pagina.setViewportSize({ width: largura, height: altura });

  if (nome === 'desktop') {
    // Login: senha pelo ambiente; código do autenticador digitado aqui no terminal.
    await pagina.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' });
    await pagina.fill('#login-email', EMAIL);
    await pagina.fill('#login-senha', SENHA);
    await pagina.locator('button[type="submit"]').first().click();
    await pagina.waitForTimeout(2500);
    if (await pagina.locator('input[autocomplete="one-time-code"]').count()) {
      const codigo = (await rl.question('Código do autenticador (6 dígitos): ')).trim();
      await pagina.fill('input[autocomplete="one-time-code"]', codigo);
      await pagina.keyboard.press('Enter');
      await pagina.waitForTimeout(3000);
    }
    if (pagina.url().includes('/entrar')) {
      console.error('Login não concluiu. Verifique a senha e o código e rode de novo.');
      await browser.close(); rl.close(); process.exit(2);
    }
  }

  for (const [slug, rota] of TELAS) {
    const r = { tela: slug, viewport: nome, rota, erros_antes: erros.length };
    await pagina.goto(`${BASE}${rota}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await pagina.waitForTimeout(1500);
    r.url_final = pagina.url();
    r.titulo = await pagina.title();
    r.rolagem_horizontal = await pagina.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    r.textos_de_vazio = await pagina.locator('text=/nenhum|nenhuma|sem registro|não há/i').allInnerTexts().catch(() => []);
    r.erros_novos = erros.slice(r.erros_antes);
    await pagina.screenshot({ path: join(SAIDA, `${slug}-${nome}.png`), fullPage: false });
    resultados.push(r);
  }
}
await pagina.close();

writeFileSync(join(SAIDA, 'relatorio.json'), JSON.stringify(resultados, null, 2));
console.log(`Pronto: ${resultados.length} registros em ${SAIDA}`);
rl.close();
await browser.close();
