import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';
import { abrirLista } from './apoio/lista';

test('concessionária: a página dela mostra só as obras dela', async ({ page }) => {
  await instalarBackend(page, {
    licencas: [
      licenca({ contratante_id: 'op1' }),
      licenca({ contratante_id: 'op1' }),
      licenca({ contratante_id: null, contratante_razao_social: 'Outra S.A.', contratante_cnpj: null }),
    ],
  });
  // O bloco de concessionárias saiu da consulta de obras; a página dela continua acessível pela rota.
  await page.goto('/consulta/obras/concessionaria/opum');
  await expect(page).toHaveURL(/\/consulta\/obras\/concessionaria\/opum/);
  await expect(page.getByRole('heading', { name: 'OpUm' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Obras de OpUm/ }).locator('li')).toHaveCount(2);
  // A outra concessionária não aparece nesta página.
  await expect(page.getByText('Outra S.A.')).toHaveCount(0);
});

test('executora: o link "Ver obras" leva à página dela', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ contratante_id: 'op1' })] });
  await page.goto('/consulta/obras');
  await abrirLista(page);
  // O filtro por executora fica recolhido abaixo da lista.
  await page.getByText(/Filtrar por executora/).click();
  await page.getByRole('link', { name: 'Ver obras' }).first().click();
  await expect(page).toHaveURL(/\/consulta\/obras\/executora\/terceirizada/);
  await expect(page.getByRole('region', { name: /Obras de Terceirizada/ }).locator('li')).toHaveCount(1);
});
