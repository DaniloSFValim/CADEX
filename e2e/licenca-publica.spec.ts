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

test.describe('situação exibida na consulta pública', () => {
  test('obra concluída dentro do período segue a data, sem o rótulo de concluída', async ({ page }) => {
    await instalarBackend(page, {
      administrador: false,
      licencas: [licenca({ id: uuid(522), numero: '522/2026', codigo_publico: 'pubconc0002', escopo: 'Concluída cedo',
        concluida_em: dia(-5), inicio_previsto: dia(-20), fim_previsto: dia(30), validade_ate: dia(30) })],
    });
    await page.goto('/licenca/pubconc0002');
    await expect(page.getByRole('heading', { name: 'Licença vigente' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Obra concluída' })).toHaveCount(0);
  });

  test('a executora aparece só com o código, sem a situação da inscrição', async ({ page }) => {
    await instalarBackend(page, {
      administrador: false,
      licencas: [licenca({ id: uuid(523), numero: '523/2026', codigo_publico: 'pubconc0003', escopo: 'Sem situação' })],
    });
    await page.goto('/licenca/pubconc0003');
    await expect(page.getByText('inscrição no CADEX hoje')).toHaveCount(0);
  });
});
