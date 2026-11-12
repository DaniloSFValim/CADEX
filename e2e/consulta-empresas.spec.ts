import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test('a lista de empresas mostra o que já executou e contratou, e só explica quem está impedida', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ contratante_id: 'op1' })] });
  await page.goto('/consulta');

  const terceirizada = page.locator('li', { hasText: 'Terceirizada Alfa Ltda.' });
  await expect(terceirizada).toContainText('Executou 1 obra');
  await expect(terceirizada).not.toContainText('Sem validade em curso');

  // Empresa inapta: inscrita, mas sem poder atuar agora.
  const inapta = page.locator('li', { hasText: 'Operadora Inapta S.A.' });
  await expect(inapta).toContainText('Inscrita para: Telecomunicações');
  await expect(inapta).toContainText('Não pode atuar agora');
  await expect(inapta).not.toContainText('Executou');

  // Operadora habilitada: sem descrição repetida no cartão.
  await expect(page.locator('li', { hasText: 'Operadora Dois S.A.' })).not.toContainText('regularidade junto à Anatel');
  await expect(page.getByText('Nenhuma obra licenciada no CADEX como executora')).toHaveCount(0);

  // Contratante: a OpUm contratou a obra do cenário.
  const opum = page.locator('li', { hasText: 'Operadora Um S.A.' });
  await expect(opum).toContainText('Contratou 1 obra');
  await expect(opum.getByRole('link', { name: 'Ver obras contratadas' }))
    .toHaveAttribute('href', '/consulta/obras/concessionaria/opum');

  await terceirizada.getByRole('link', { name: 'Ver obras' }).click();
  await expect(page).toHaveURL(/\/consulta\/obras\/executora\/terceirizada/);
});
