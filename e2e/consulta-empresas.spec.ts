import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test('a lista de empresas diz o que cada uma pode executar e o que já executou', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ contratante_id: 'op1' })] });
  await page.goto('/consulta');

  const terceirizada = page.locator('li', { hasText: 'Terceirizada Alfa Ltda.' });
  await expect(terceirizada).toContainText('Pode executar: Telecomunicações');
  await expect(terceirizada).toContainText('Já executou: 1 obra licenciada');

  // Empresa inapta: inscrita, mas sem poder atuar agora.
  const inapta = page.locator('li', { hasText: 'Operadora Inapta S.A.' });
  await expect(inapta).toContainText('Inscrita para: Telecomunicações');
  await expect(inapta).toContainText('Não pode atuar agora');
  await expect(inapta).toContainText('Nenhuma obra licenciada no CADEX como executora');

  await terceirizada.getByRole('link', { name: 'Ver obras' }).click();
  await expect(page).toHaveURL(/\/consulta\/obras\/executora\/terceirizada/);
});
