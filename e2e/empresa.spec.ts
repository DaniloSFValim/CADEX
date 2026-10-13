import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

test.describe('cadastro da empresa: executa obras por conta própria', () => {
  test('a titular marca a opção e o cadastro grava a marca', async ({ page }) => {
    const backend = await instalarBackend(page);
    await page.goto('/empresas/op3');
    await page.getByRole('button', { name: 'Editar dados' }).click();
    const caixa = page.getByLabel('Esta empresa também executa obras ou serviços por conta própria.');
    await expect(caixa).not.toBeChecked();
    await caixa.check();
    await page.getByRole('button', { name: /^Salvar/ }).first().click();

    await expect.poll(() => backend.de('empresas', 'PATCH').length).toBe(1);
    const patch = backend.de('empresas', 'PATCH')[0];
    expect(patch.consulta.get('id')).toBe('eq.op3');
    expect(patch.corpo).toMatchObject({ executa_obras: true });
  });

  test('terceirizada não tem a opção', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/empresas/ter1');
    await page.getByRole('button', { name: 'Editar dados' }).click();
    await expect(page.getByLabel('Esta empresa também executa obras ou serviços por conta própria.')).toHaveCount(0);
  });

  test('no cadastro novo, trocar para terceirizada desmarca e esconde a opção', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/empresas/nova');
    const caixa = page.getByLabel('Esta empresa também executa obras ou serviços por conta própria.');
    await caixa.check();
    await page.locator('#tipo').selectOption('terceirizada');
    await expect(caixa).toHaveCount(0);
  });
});
