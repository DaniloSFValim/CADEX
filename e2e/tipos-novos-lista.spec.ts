import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca, uuid } from './apoio/dados';
import type { TipoObra } from '../src/lib/licencas';

test.describe('lista de licenças com tipos do catálogo novo', () => {
  test('licença com caixa R2 e galeria aparece na lista, sem erro de página', async ({ page }) => {
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await instalarBackend(page, {
      administrador: true,
      // o catálogo, não a união TipoObra, define os códigos
      licencas: [licenca({ id: uuid(541), numero: '541/2026', processo_sei: 'NIT-1/541/2026', escopo: 'Caixa e galeria',
        setor: 'telecom', tipos_obra: ['caixa_r_dois', 'galeria'] as unknown as TipoObra[], inicio_previsto: dia(-10), fim_previsto: dia(20) })],
    });
    await page.goto('/obras');
    await expect(page.getByRole('link', { name: '541/2026' })).toBeVisible();
    expect(erros).toEqual([]);
  });
});
