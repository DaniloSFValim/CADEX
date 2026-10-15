import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

/** Trecho de licença com início no ponto dado (lng, lat). */
const trecho = (logradouro: string, lng: number, lat: number) => ({
  id: `t-${logradouro}`, ordem: 1, logradouro, bairro: 'Centro', referencia: null,
  inicio_lat: lat, inicio_lng: lng, fim_lat: null, fim_lng: null,
});

// Visitante em (-22.9, -43.1). Obras a ~55 m, ~500 m e ~2,2 km.
const perto = licenca({ licenca_trechos: [trecho('Rua Perto', -43.1005, -22.9)] });
const medio = licenca({ licenca_trechos: [trecho('Rua Medio', -43.105, -22.9)] });
const longe = licenca({ licenca_trechos: [trecho('Rua Longe', -43.12, -22.9)] });

test.describe('consulta pública: obras perto de você', () => {
  test.use({ geolocation: { latitude: -22.9, longitude: -43.1 }, permissions: ['geolocation'] });

  test('com a localização permitida, lista as obras mais próximas, da mais perto para a mais longe', async ({ page }) => {
    await instalarBackend(page, { licencas: [longe, perto, medio] });
    await page.goto('/consulta/obras');
    await expect(page.getByRole('heading', { name: 'Obras perto de você' })).toBeVisible();

    await page.getByRole('button', { name: 'Usar minha localização' }).click();

    const itens = page.getByRole('region', { name: /Obras perto/ }).locator('li');
    await expect(itens.first()).toBeVisible();
    await expect(itens).toHaveCount(3);
    await expect(itens.nth(0)).toContainText('Rua Perto');
    await expect(itens.nth(1)).toContainText('Rua Medio');
    await expect(itens.nth(2)).toContainText('Rua Longe');
    await expect(itens.nth(0)).toContainText(/\d+ m/);
    await expect(itens.nth(2)).toContainText('km');
  });

  test('sem permissão, a página segue usável e explica o caso', async ({ browser }) => {
    const contexto = await browser.newContext({ permissions: [] });
    const page = await contexto.newPage();
    await instalarBackend(page, { licencas: [perto] });
    await page.goto('/consulta/obras');
    await page.getByRole('button', { name: 'Usar minha localização' }).click();
    await expect(page.getByText(/Não foi possível obter a localização/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Obras perto de você' })).toBeVisible();
    await contexto.close();
  });
});

test.describe('consulta pública: agrupamento no mapa', () => {
  test('muitos pontos próximos viram agrupamento e a tela não quebra', async ({ page }) => {
    // 30 obras num raio de poucos metros: no zoom de cidade, viram um agrupamento.
    const muitas = Array.from({ length: 30 }, (_, i) =>
      licenca({ licenca_trechos: [trecho(`Rua ${i}`, -43.1 + i * 0.00002, -22.9 + i * 0.00002)] }));
    await instalarBackend(page, { licencas: muitas });
    await page.goto('/consulta/obras');
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/consulta-agrupamento.png', fullPage: false });
  });
});
