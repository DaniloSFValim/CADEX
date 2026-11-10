import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

// Quem está conectado vê o mesmo menu e a mesma saída em qualquer página,
// inclusive nas públicas. Quem não está vê a entrada da área restrita.

const menu = (page: import('@playwright/test').Page) => page.locator('header nav[aria-label="Menu principal"]');

test.describe('navegação e cabeçalho', () => {
  test('conectado, a consulta pública mostra o menu da área restrita e a saída', async ({ page }) => {
    await instalarBackend(page, { perfil: 'gestor' });
    await page.goto('/consulta/obras');
    await expect(menu(page).getByRole('link', { name: 'Painel' })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Empresas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Área restrita' })).toHaveCount(0);
  });

  test('conectado, o rodapé não repete a entrada da área restrita', async ({ page }) => {
    await instalarBackend(page, { perfil: 'gestor' });
    await page.goto('/consulta/obras');
    await expect(page.locator('footer').getByRole('link', { name: 'Área restrita' })).toHaveCount(0);
  });

  test('sem conexão, a página pública mostra a entrada da área restrita e nenhum menu interno', async ({ page }) => {
    await instalarBackend(page, { perfil: 'gestor' });
    await page.addInitScript(() => localStorage.removeItem('sb-localhost-auth-token'));
    await page.goto('/consulta/obras');
    await expect(page.getByRole('link', { name: 'Área restrita' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
    await expect(menu(page)).toHaveCount(0);
  });
});
