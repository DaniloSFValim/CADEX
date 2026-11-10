import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';
import { abrirLista } from './apoio/lista';

test.use({ viewport: { width: 1280, height: 900 } });

test('no computador, o mapa ocupa cerca de 65% e a lista 35%, lado a lado', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ numero: '801/2026' })] });
  await page.goto('/consulta/obras');
  await abrirLista(page);
  const lista = page.locator('section[aria-label="Lista das obras e serviços licenciados"]');
  // A grade do mapa e da lista é a que contém a lista; a grade dos indicadores não.
  const mapa = page.locator('#conteudo .grid').filter({ has: lista }).first().locator(':scope > div').first();
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
  await abrirLista(page);
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(2);
  await page.getByPlaceholder('Rua, bairro, nº da licença ou empresa').fill('812');
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(1);
  await expect(page.locator('li[id^="obra-"]')).toContainText('812');
  await page.getByRole('button', { name: 'Limpar busca e período' }).click();
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(2);
});

test('o indicador "Em andamento ou a começar" é clicável e marca o estado', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ numero: '821/2026' })] });
  await page.goto('/consulta/obras');
  await abrirLista(page);
  // Por padrão a consulta mostra todas as obras; o indicador só marca quando o filtro de vigentes é escolhido.
  const vigentes = page.getByRole('button', { name: /Em andamento ou a começar/ });
  await expect(vigentes).toHaveAttribute('aria-pressed', 'false');
  await vigentes.click();
  await expect(vigentes).toHaveAttribute('aria-pressed', 'true');
});

test('ordenar por empresa muda a lista para um grupo só, sem o botão por bairro', async ({ page }) => {
  await instalarBackend(page, {
    licencas: [licenca({ numero: '831/2026', executora_id: 'ter1' }), licenca({ numero: '832/2026', executora_id: 'op1' })],
  });
  await page.goto('/consulta/obras');
  await abrirLista(page);
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
    await abrirLista(page);
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

test('destacar um bairro no mapa não esconde as obras dos outros bairros', async ({ page }) => {
  const trecho = (bairro: string) => [{ id: `t-${bairro}`, ordem: 1, logradouro: `Rua ${bairro}`, bairro, referencia: null,
    inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null }];
  await instalarBackend(page, {
    licencas: [
      licenca({ numero: '851/2026', licenca_trechos: trecho('Icaraí') }),
      licenca({ numero: '852/2026', licenca_trechos: trecho('Badu') }),
    ],
  });
  await page.goto('/consulta/obras');
  await abrirLista(page);
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Ver Icaraí no mapa' }).click();
  await expect(page.getByText('Bairro destacado: Icaraí')).toBeVisible();
  // As duas continuam na lista: o destaque não filtra.
  await expect(page.locator('li[id^="obra-"]')).toHaveCount(2);
});

test('a lista de obras começa recolhida, com o total; abre pelo cabeçalho', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({}), licenca({ numero: '2/2026' })] });
  await page.goto('/consulta/obras');
  const bloco = page.locator('details', { has: page.locator('summary', { hasText: 'Lista de obras e serviços' }) }).first();
  await expect(bloco.locator(':scope > summary')).toContainText('Lista de obras e serviços');
  await expect(bloco.locator(':scope > summary')).toContainText('2 itens');
  await expect(bloco).not.toHaveAttribute('open', '');
  await bloco.locator(':scope > summary').click();
  await expect(bloco).toHaveAttribute('open', '');
  await expect(page.locator('section[aria-label="Lista das obras e serviços licenciados"] details li')).toHaveCount(2);
});

test('a lista aberta mostra um lote de 60 obras e "Mostrar mais" traz o resto', async ({ page }) => {
  const base = licenca().licenca_trechos[0];
  const muitas = Array.from({ length: 70 }, (_, i) =>
    licenca({ numero: `${i + 1}/2026`, licenca_trechos: [{ ...base, bairro: 'Centro', logradouro: `Rua Teste ${i + 1}` }] }));
  await instalarBackend(page, { licencas: muitas });
  await page.goto('/consulta/obras');
  await abrirLista(page);
  const itens = page.locator('section[aria-label="Lista das obras e serviços licenciados"] details li');
  await expect(itens).toHaveCount(60);
  await page.getByRole('button', { name: 'Mostrar mais (10 restantes)' }).click();
  await expect(itens).toHaveCount(70);
  await expect(page.getByRole('button', { name: /Mostrar mais/ })).toHaveCount(0);
});

test('obra escolhida depois do primeiro lote aparece na lista aberta', async ({ page }) => {
  const base = licenca().licenca_trechos[0];
  const muitas = Array.from({ length: 70 }, (_, i) =>
    licenca({ numero: `${i + 1}/2026`, licenca_trechos: [{ ...base, bairro: 'Centro', logradouro: `Rua Teste ${i + 1}` }] }));
  await instalarBackend(page, { licencas: muitas });
  const alvo = muitas[64];
  await page.goto(`/consulta/obras?obra=${alvo.codigo_publico}`);
  await abrirLista(page);
  await expect(page.locator(`li#obra-${alvo.codigo_publico}`)).toHaveCount(1);
});

test('os números gerais mostram contagens úteis, não "vigentes" zerado', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ numero: '901/2026' })] });
  await page.goto('/consulta/obras');
  await expect(page.getByText('Licenças deferidas nos últimos 12 meses')).toBeVisible();
  await expect(page.getByText('Obras concluídas')).toBeVisible();
  await expect(page.getByText('Vigentes agora')).toHaveCount(0);
});
