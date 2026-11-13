import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

test.describe('área da intervenção no formulário da licença', () => {
  test('trecho novo começa como segmento; ponto avulso é oferecido; área não é oferecida', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await expect(page.getByRole('radio', { name: 'Segmento' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Ponto' })).toHaveCount(1);
    await expect(page.getByRole('radio', { name: 'Área' })).toHaveCount(0);
  });

  test('licença: segmento aceita vários cliques no mapa, cada um acrescenta um ponto', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await page.getByRole('button', { name: 'Marcar no mapa' }).click();
    const mapa = page.getByRole('region', { name: 'Mapa para marcar o trecho' });
    await expect(mapa.locator('canvas')).toHaveCount(1);
    const caixa = await mapa.boundingBox();
    if (!caixa) throw new Error('mapa sem área visível');
    await page.mouse.click(caixa.x + caixa.width * 0.3, caixa.y + caixa.height * 0.5);
    await expect(page.getByText('1 ponto neste segmento.')).toBeVisible();
    await page.mouse.click(caixa.x + caixa.width * 0.45, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.5);
    await expect(page.getByText('3 pontos neste segmento.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Concluir segmento' })).toBeVisible();
  });

  test('obra sem licença: segmento aceita vários cliques; o terceiro não desfaz os anteriores', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/sem-licenca/nova');
    await page.getByRole('radio', { name: 'Segmento' }).check();
    await page.getByRole('button', { name: 'Marcar no mapa' }).click();
    const mapa = page.getByRole('region', { name: 'Mapa para marcar o trecho' });
    await expect(mapa.locator('canvas')).toHaveCount(1);
    const caixa = await mapa.boundingBox();
    if (!caixa) throw new Error('mapa sem área visível');
    await page.mouse.click(caixa.x + caixa.width * 0.3, caixa.y + caixa.height * 0.5);
    await page.mouse.click(caixa.x + caixa.width * 0.45, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.5);
    await expect(page.getByText('3 pontos neste segmento.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Concluir segmento' })).toBeVisible();
  });

  test('obra sem licença: o tipo área marca o polígono no mapa', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/sem-licenca/nova');
    await page.getByRole('radio', { name: 'Área' }).check();
    await page.getByRole('button', { name: 'Marcar no mapa' }).click();
    const mapa = page.getByRole('region', { name: 'Mapa para marcar o trecho' });
    await expect(mapa.locator('canvas')).toHaveCount(1);
    const caixa = await mapa.boundingBox();
    if (!caixa) throw new Error('mapa sem área visível');
    await page.mouse.click(caixa.x + caixa.width * 0.4, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.5, caixa.y + caixa.height * 0.6);
    await expect(page.getByText('3 vértices marcados.')).toBeVisible();
  });
});
