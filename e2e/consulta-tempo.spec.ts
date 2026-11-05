import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

const NOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

test('linha do tempo: um mês sem obras zera a contagem; voltar mostra todas', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ contratante_id: 'op1' })] });
  await page.goto('/consulta/obras');
  await page.getByText('Linha do tempo').click();
  // Seis meses à frente: a obra de exemplo (dez dias antes a vinte dias depois de hoje) não cai ali.
  const distante = (new Date().getMonth() + 6) % 12;
  await page.getByLabel('Mês do mapa').fill(String(distante));
  await expect(page.getByText(`0 obras ativas em ${NOMES[distante]}`)).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar todas as datas' }).click();
  await expect(page.getByText('Mostra todas as obras')).toBeVisible();
});

test('linha do tempo: reproduzir avança os meses e pausar para', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ contratante_id: 'op1' })] });
  await page.goto('/consulta/obras');
  await page.getByText('Linha do tempo').click();
  await page.getByRole('button', { name: 'Reproduzir' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  // Depois de alguns avanços, o mês já não é janeiro: a reprodução andou.
  await expect(page.getByText(/^(fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de /).first()).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('button', { name: 'Reproduzir' })).toBeVisible();
});
