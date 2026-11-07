import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca, uuid } from './apoio/dados';

/**
 * A página não pode rolar na horizontal em tablet nem em celular. Já tivemos o caso
 * do texto só para leitor de tela (sr-only) de um cabeçalho de tabela, que escapava
 * do contêiner de rolagem e alargava a página inteira.
 */
const LICENCA_ID = uuid(9001);
const ROTAS = ['/dashboard', '/dashboard/pendencias', '/obras', '/obras/nova', `/obras/${LICENCA_ID}`, '/empresas', '/empresas/nova', '/empresas/op1',
  '/admin', '/admin/empresas', '/admin/licencas', '/admin/manutencao', '/admin/tipos', '/admin/orgaos', '/admin/auditoria', '/admin/configuracoes'];
const LARGURAS = [820, 390];

for (const largura of LARGURAS) {
  for (const rota of ROTAS) {
    test(`${rota} em ${largura}px não rola na horizontal`, async ({ page }) => {
      await instalarBackend(page, {
        administrador: true,
        licencas: [licenca({ id: LICENCA_ID, inicio_previsto: dia(-10), fim_previsto: dia(20) }), licenca({ inicio_previsto: dia(3), fim_previsto: dia(40) })],
      });
      await page.setViewportSize({ width: largura, height: 1000 });
      await page.goto(rota);
      await page.locator('main').waitFor();
      await page.waitForLoadState('networkidle');
      const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(excesso).toBeLessThanOrEqual(0);
    });
  }
}
