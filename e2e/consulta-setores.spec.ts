import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test.describe('consulta pública: obras vigentes por setor', () => {
  test('mostra a contagem por setor e o clique filtra a lista', async ({ page }) => {
    const licencas = [
      licenca({ numero: '901/2026', setor: 'viario' }),
      licenca({ numero: '902/2026', setor: 'viario' }),
      licenca({ numero: '903/2026', setor: 'gas' }),
    ];
    await instalarBackend(page, { licencas });
    await page.goto('/consulta/obras');

    const grupo = page.getByRole('list', { name: 'Obras vigentes por setor' });
    await expect(grupo).toBeVisible();
    await expect(grupo.getByRole('button', { name: /Viário \/ mobilidade: 2 obras vigentes/ })).toBeVisible();
    await expect(grupo.getByRole('button', { name: /Gás: 1 obras vigentes/ })).toBeVisible();

    await grupo.getByRole('button', { name: /Gás: 1 obras vigentes/ }).click();
    await expect(page.getByLabel('Setor', { exact: true })).toHaveValue('gas');
  });
});
