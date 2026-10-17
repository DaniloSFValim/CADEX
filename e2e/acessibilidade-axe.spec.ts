import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instalarBackend } from './apoio/backend';

// Varredura automática com axe-core (WCAG 2.0 e 2.1, níveis A e AA) nas telas
// que já têm teste de tela. Pega contraste, rótulos, landmarks e ARIA que a
// revisão manual deixa passar. Não substitui o teste com leitor de tela.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function varrer(page: Page) {
  // Espera a tela montar: a região principal aparece depois do carregamento.
  await expect(page.locator('main#conteudo')).toBeVisible();
  const resultado = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return resultado.violations.map((v) => ({
    id: v.id,
    impacto: v.impact,
    ajuda: v.help,
    nos: v.nodes.map((n) => n.target.join(' ')),
  }));
}

test.describe('acessibilidade automatizada (axe, WCAG AA)', () => {
  test('consulta de obras, a página pública principal', async ({ page }) => {
    await instalarBackend(page, { licencas: [] });
    await page.goto('/consulta/obras');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await varrer(page)).toEqual([]);
  });

  test('entrada na área restrita', async ({ page }) => {
    await instalarBackend(page, {});
    await page.goto('/entrar');
    expect(await varrer(page)).toEqual([]);
  });

  test('painel de pendências', async ({ page }) => {
    await instalarBackend(page, { perfil: 'gestor' });
    await page.goto('/pendencias');
    expect(await varrer(page)).toEqual([]);
  });

  test('administração: licenças', async ({ page }) => {
    await instalarBackend(page, { administrador: true });
    await page.goto('/admin/licencas');
    expect(await varrer(page)).toEqual([]);
  });

  test('administração: auditoria', async ({ page }) => {
    await instalarBackend(page, { administrador: true });
    await page.goto('/admin/auditoria');
    expect(await varrer(page)).toEqual([]);
  });
});
