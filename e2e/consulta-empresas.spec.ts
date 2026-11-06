import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test('a lista de empresas diz o que cada uma faz e o que já executou', async ({ page }) => {
  await instalarBackend(page, { licencas: [licenca({ contratante_id: 'op1' })] });
  await page.goto('/consulta');

  const terceirizada = page.locator('li', { hasText: 'Terceirizada Alfa Ltda.' });
  await expect(terceirizada).toContainText('Terceirizada para mão de obra de construção e manutenção de infraestrutura de telecomunicações.');
  await expect(terceirizada).toContainText('Já executou: 1 obra licenciada');

  // Empresa inapta: inscrita, mas sem poder atuar agora.
  const inapta = page.locator('li', { hasText: 'Operadora Inapta S.A.' });
  await expect(inapta).toContainText('Inscrita para: Telecomunicações');
  await expect(inapta).toContainText('Não pode atuar agora');
  await expect(inapta).not.toContainText('Já executou');

  // Operadora habilitada: regularidade na Anatel declarada na inscrição.
  await expect(page.locator('li', { hasText: 'Operadora Dois S.A.' }))
    .toContainText('Operadora de serviços de telecomunicações, com regularidade junto à Anatel declarada na inscrição.');
  await expect(page.getByText('Nenhuma obra licenciada no CADEX como executora')).toHaveCount(0);

  await terceirizada.getByRole('link', { name: 'Ver obras' }).click();
  await expect(page).toHaveURL(/\/consulta\/obras\/executora\/terceirizada/);
});
