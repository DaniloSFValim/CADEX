import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

test.describe('área da intervenção no formulário da licença', () => {
  test('marcar pontos no mapa forma a área, e desfazer e limpar funcionam', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await page.getByRole('button', { name: 'Desenhar a área no mapa' }).click();

    const mapa = page.getByRole('region', { name: 'Mapa para desenhar a área da intervenção' });
    await expect(mapa).toBeVisible();
    const caixa = await mapa.boundingBox();
    if (!caixa) throw new Error('mapa sem área visível');

    await page.mouse.click(caixa.x + caixa.width * 0.4, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.4);
    await page.mouse.click(caixa.x + caixa.width * 0.5, caixa.y + caixa.height * 0.6);
    await expect(page.getByText('3 pontos marcados.')).toBeVisible();

    await page.getByRole('button', { name: 'Desfazer último ponto' }).click();
    await expect(page.getByText('2 pontos marcados.')).toBeVisible();
    await expect(page.getByText('Marque pelo menos 3 pontos para formar a área.')).toBeVisible();

    await page.getByRole('button', { name: 'Limpar área' }).click();
    await expect(page.getByText('Nenhum ponto marcado.')).toBeVisible();
  });
});
