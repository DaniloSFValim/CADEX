import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test.use({ viewport: { width: 1280, height: 900 } });

test('no computador, o mapa ocupa cerca de 65% e a lista 35%, lado a lado', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ numero: '801/2026' })] });
  await page.goto('/consulta/obras');
  const mapa = page.locator('#conteudo .grid > div').first();
  const lista = page.locator('section[aria-label="Lista das obras e serviços licenciados"]');
  await expect(lista).toBeVisible();
  const bm = await mapa.boundingBox();
  const bl = await lista.boundingBox();
  expect(bm && bl).toBeTruthy();
  expect(bl!.x).toBeGreaterThan(bm!.x + bm!.width - 1);
  const proporcao = bm!.width / (bm!.width + bl!.width);
  expect(proporcao).toBeGreaterThan(0.6);
  expect(proporcao).toBeLessThan(0.7);
});

test('busca por número de licença filtra a lista (e o mapa acompanha)', async ({ page }) => {
  await instalarBackend(page, {
    licencas: [licenca({ numero: '811/2026', executora_id: 'ter1' }), licenca({ numero: '812/2026', executora_id: 'op1' })],
  });
  await page.goto('/consulta/obras');
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(2);
  await page.getByPlaceholder('Rua, bairro, nº da licença ou empresa').fill('812');
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(1);
  await expect(page.locator('li[id^="obra-"]')).toContainText('812');
  await page.getByRole('button', { name: 'Limpar busca e período' }).click();
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(2);
});

test('o indicador "Vigentes agora" é clicável e marca o estado', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ numero: '821/2026' })] });
  await page.goto('/consulta/obras');
  const vigentes = page.getByRole('button', { name: /Vigentes agora/ });
  await expect(vigentes).toHaveAttribute('aria-pressed', 'true');
  await vigentes.click();
  await expect(vigentes).toHaveAttribute('aria-pressed', 'true');
});

test('ordenar por empresa muda a lista para um grupo só, sem o botão por bairro', async ({ page }) => {
  await instalarBackend(page, {
    licencas: [licenca({ numero: '831/2026', executora_id: 'ter1' }), licenca({ numero: '832/2026', executora_id: 'op1' })],
  });
  await page.goto('/consulta/obras');
  await page.getByLabel('Ordenar').selectOption('empresa');
  await expect(page.getByText('Por empresa executora')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ver .+ no mapa$/ })).toHaveCount(0);
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(2);
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no celular, os filtros ficam recolhidos e abrem ao toque; a página não rola para os lados', async ({ page }) => {
    await instalarBackend(page, { licencas: [licenca({ numero: '841/2026' })] });
    await page.goto('/consulta/obras');
    const botao = page.getByRole('button', { name: 'Filtros e ordenação' });
    await expect(botao).toBeVisible();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Ordenar')).toBeHidden();
    await botao.click();
    await expect(page.getByLabel('Ordenar')).toBeVisible();
    const larguraPagina = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(larguraPagina).toBeLessThanOrEqual(390);
  });
});
