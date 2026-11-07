import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

/** A exportação sai com a lista que está na tela: os filtros aplicados recortam o que vai no arquivo. */
test.describe('exportação respeita os filtros da tela', () => {
  test('empresas: a busca da tela recorta a exportação', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/empresas');
    await page.getByLabel('Buscar').fill('Alfa');
    await page.getByRole('button', { name: 'Exportar (PDF ou planilha)' }).click();
    await expect(page.getByText(/^1 registro,/)).toBeVisible();
  });

  test('obras: o filtro de origem recorta a exportação', async ({ page }) => {
    await instalarBackend(page, {
      licencas: [
        licenca({ numero: '871/2026', origem_intervencao: 'concessionaria' }),
        licenca({ numero: '872/2026', origem_intervencao: 'municipio', contratante_id: null, orgao_contratante_id: 'org1' }),
      ],
    });
    await page.goto('/obras');
    await page.getByLabel('Origem da intervenção').selectOption('concessionaria');
    await page.getByRole('button', { name: 'Exportar (PDF ou planilha)' }).click();
    await expect(page.getByText(/^1 registro,/)).toBeVisible();
  });
});
