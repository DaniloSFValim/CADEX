import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

test.describe('área da intervenção no formulário da licença', () => {
  test('marcar pontos no mapa forma a área, e desfazer e limpar funcionam', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await page.getByRole('radio', { name: 'Área' }).check();
    await page.getByRole('button', { name: 'Marcar no mapa' }).click();

    const mapa = page.getByRole('region', { name: 'Mapa para marcar o trecho' });
    await expect(mapa).toBeVisible();
    // O mapa só recebe cliques depois de criado (o estilo base carrega antes).
    await expect(mapa.locator('canvas')).toHaveCount(1);
    const caixa = await mapa.boundingBox();
    if (!caixa) throw new Error('mapa sem área visível');

    await page.mouse.click(caixa.x + caixa.width * 0.4, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.5, caixa.y + caixa.height * 0.6);
    await expect(page.getByText('3 vértices marcados.')).toBeVisible();

    await page.getByRole('button', { name: 'Desfazer último ponto' }).click();
    await expect(page.getByText('2 vértices marcados.')).toBeVisible();
    await expect(page.getByText('2 vértices marcados.')).toBeVisible();

    await page.getByRole('button', { name: 'Limpar área' }).click();
    await expect(page.getByText('Clique nos cantos da área.')).toBeVisible();
  });

  test('o tipo ponto marca só o início, sem fim', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await page.getByRole('button', { name: 'Marcar no mapa' }).click();
    const mapa = page.getByRole('region', { name: 'Mapa para marcar o trecho' });
    await expect(mapa).toBeVisible();
    const caixa = await mapa.boundingBox();
    if (!caixa) throw new Error('mapa sem área visível');
    // O mapa pode ainda não estar pronto para cliques: repete até a marcação aparecer.
    await expect(async () => {
      await page.mouse.click(caixa.x + caixa.width * 0.5, caixa.y + caixa.height * 0.5);
      await expect(page.getByText('Ponto marcado. Clique de novo para trocar.')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
    await expect(page.getByLabel('Fim', { exact: true })).toHaveCount(0);
  });
});
