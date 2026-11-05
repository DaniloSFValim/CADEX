import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test('concessionária: o bloco leva a uma página só com as obras dela', async ({ page }) => {
  await instalarBackend(page, {
    licencas: [
      licenca({ contratante_id: 'op1' }),
      licenca({ contratante_id: 'op1' }),
      licenca({ contratante_id: null, contratante_razao_social: 'Outra S.A.', contratante_cnpj: null }),
    ],
  });
  await page.goto('/consulta/obras');
  await page.getByRole('link', { name: /OpUm/ }).first().click();
  await expect(page).toHaveURL(/\/consulta\/obras\/concessionaria\/opum/);
  await expect(page.getByRole('heading', { name: 'OpUm' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Obras de OpUm/ }).locator('li')).toHaveCount(2);
  // A outra concessionária não aparece nesta página.
  await expect(page.getByText('Outra S.A.')).toHaveCount(0);
});

test('executora: o link "Ver obras" leva à página dela', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ contratante_id: 'op1' })] });
  await page.goto('/consulta/obras');
  await page.getByRole('link', { name: 'Ver obras' }).first().click();
  await expect(page).toHaveURL(/\/consulta\/obras\/executora\/terceirizada/);
  await expect(page.getByRole('region', { name: /Obras de Terceirizada/ }).locator('li')).toHaveCount(1);
});
