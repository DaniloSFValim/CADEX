import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test('a consulta pública mostra o mapa, sem lista de obras', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ numero: '801/2026' })] });
  await page.goto('/consulta/obras');
  await expect(page.getByRole('region', { name: 'Mapa das obras licenciadas em Niterói' })).toBeVisible();
  await expect(page.getByText('Lista de obras e serviços')).toHaveCount(0);
  await expect(page.getByRole('region', { name: /Lista das obras/ })).toHaveCount(0);
});

test('os números gerais mostram contagens úteis, não "vigentes" zerado', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ numero: '901/2026' })] });
  await page.goto('/consulta/obras');
  await expect(page.getByText('Licenças autorizadas nos últimos 12 meses')).toBeVisible();
  await expect(page.getByText('Obras concluídas nos últimos 5 anos')).toBeVisible();
  await expect(page.getByText('Em andamento ou a começar')).toHaveCount(0);
});
