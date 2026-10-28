import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

test.describe('acessibilidade: pular para o conteúdo', () => {
  test('o primeiro Tab mostra o link, e Enter leva o foco ao conteúdo principal', async ({ page }) => {
    await instalarBackend(page, { licencas: [] });
    await page.goto('/consulta/obras');
    // A página é carregada sob demanda: espera o link existir antes do primeiro Tab.
    const link = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(link).toBeAttached();
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(link).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#conteudo')).toBeFocused();
  });
});
