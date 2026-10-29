import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca, uuid } from './apoio/dados';

test.describe('suspensão a pedido e pedidos de correção', () => {
  test('o gestor suspende, retoma e registra um pedido de correção pela ficha', async ({ page }) => {
    await instalarBackend(page, {
      administrador: false,
      perfil: 'gestor',
      licencas: [licenca({ id: uuid(561), numero: '561/2026', codigo_publico: 'suspens0001', processo_sei: 'NIT-1/561/2026',
        escopo: 'Suspensão', inicio_previsto: dia(-10), fim_previsto: dia(20) })],
    });
    await page.goto(`/obras/${uuid(561)}`);
    const secao = page.getByRole('region', { name: 'Suspensão e pedidos de correção' });
    await expect(secao).toBeVisible();

    await secao.getByLabel('Motivo', { exact: true }).fill('Obra parada por ordem da fiscalização');
    await secao.getByRole('button', { name: 'Suspender', exact: true }).click();
    await expect(secao.getByText(/Suspensa desde/)).toBeVisible();

    await secao.getByRole('button', { name: 'Retomar', exact: true }).click();
    await expect(secao.getByText('Não está suspensa.')).toBeVisible();

    await secao.getByLabel('Novo pedido de correção').fill('Falta a fotografia da recomposição');
    await secao.getByRole('button', { name: 'Pedir correção', exact: true }).click();
    await expect(secao.getByText('Falta a fotografia da recomposição')).toBeVisible();

    await secao.getByLabel('Resolução').fill('Fotografia anexada');
    await secao.getByRole('button', { name: 'Registrar resolução', exact: true }).click();
    await expect(secao.getByText(/Resolvido em/)).toBeVisible();
  });
});
