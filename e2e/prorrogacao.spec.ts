import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca, uuid } from './apoio/dados';

test.describe('prorrogação de validade contada', () => {
  test('o administrador prorroga, e a contagem sobe: 1ª, depois 2ª', async ({ page }) => {
    await instalarBackend(page, {
      administrador: true,
      licencas: [licenca({ id: uuid(511), numero: '511/2026', processo_sei: 'NIT-1/511/2026', escopo: 'Prorrogável' })],
    });
    await page.goto('/admin/licencas');
    await page.getByLabel('Buscar licença').fill('511/2026');
    const campo = page.getByLabel('Nova validade de 511/2026');
    await campo.fill(dia(50));
    await page.getByLabel('Pedido da empresa para 511/2026').check();
    await page.getByRole('button', { name: 'Prorrogar', exact: true }).click();
    await expect(page.getByText('1ª prorrogação')).toBeVisible();
    await campo.fill(dia(80));
    await page.getByRole('button', { name: 'Prorrogar', exact: true }).click();
    await expect(page.getByText('2ª prorrogação')).toBeVisible();
  });

  test('a ficha da licença mostra a contagem', async ({ page }) => {
    await instalarBackend(page, {
      administrador: true,
      licencas: [licenca({ id: uuid(512), numero: '512/2026', processo_sei: 'NIT-1/512/2026', prorrogacoes: 2 })],
    });
    await page.goto(`/obras/${uuid(512)}`);
    await expect(page.getByText('Já prorrogada: 2ª prorrogação')).toBeVisible();
  });
});
