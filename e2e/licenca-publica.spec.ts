import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca, uuid } from './apoio/dados';

test.describe('licença na consulta pública', () => {
  test('obra concluída mostra a frase, sem histórico interno da situação', async ({ page }) => {
    await instalarBackend(page, {
      administrador: false,
      licencas: [licenca({ id: uuid(521), numero: '521/2026', codigo_publico: 'pubconc0001', escopo: 'Concluída',
        concluida_em: dia(-5), inicio_previsto: dia(-60), fim_previsto: dia(-10), validade_ate: dia(-10) })],
    });
    await page.goto('/licenca/pubconc0001');
    await expect(page.getByRole('heading', { name: 'Obra concluída' })).toBeVisible();
    await expect(page.getByText('A obra ou serviço desta licença foi concluída.')).toBeVisible();
    await expect(page.getByText('Histórico da situação')).toHaveCount(0);
    await expect(page.getByText('Pedido registrado')).toHaveCount(0);
    await expect(page.getByText('Deferida')).toHaveCount(0);
  });
});
