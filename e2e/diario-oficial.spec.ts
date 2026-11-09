import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { empresa } from './apoio/dados';

test.describe('relação para o Diário Oficial', () => {
  test('marca só empresas que podem atuar e exporta a relação em PDF e planilha, sem Markdown', async ({ page }) => {
    await instalarBackend(page, {
      empresas: [
        empresa('op1', 'Operadora Um S.A.', 'operadora', { situacao: 'deferida' }),
        empresa('op2', 'Operadora Dois S.A.', 'operadora', { situacao: 'em_analise' }),
      ],
    });
    await page.goto('/empresas');

    // Empresa em análise não pode ser marcada.
    await expect(page.getByRole('checkbox', { name: /Marcar Operadora Dois/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: /Marcar Operadora Um/ }).check();
    await expect(page.getByRole('button', { name: 'Diário Oficial (1 marcada)' })).toBeEnabled();
    await page.getByRole('button', { name: 'Diário Oficial (1 marcada)' }).click();

    const painel = page.getByRole('region', { name: 'Relação para o Diário Oficial' });
    await expect(painel).toContainText('1 empresa marcada para publicação');
    await expect(painel.getByRole('button', { name: 'Baixar PDF' })).toBeVisible();
    await expect(painel.getByRole('button', { name: 'Baixar planilha' })).toBeVisible();
    await expect(painel.getByRole('button', { name: 'Baixar Markdown' })).toHaveCount(0);

    await painel.getByRole('button', { name: 'Limpar marcação' }).click();
    await expect(page.getByRole('button', { name: 'Diário Oficial (0 marcadas)' })).toBeDisabled();
  });
});
