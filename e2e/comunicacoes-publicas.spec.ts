import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

test.describe('comunicações ao CISP na consulta pública', () => {
  test('mostra a legenda das duas modalidades e busca as comunicações públicas', async ({ page }) => {
    const backend = await instalarBackend(page, {
      comunicacoes: [
        {
          id: '00000000-0000-4000-8000-000000009901', empresa_id: 'ter1', tipo: 'emergencia', tipo_servico: 'Rompimento de cabo',
          responsavel: 'Plantão', placas: ['ABC1234'], local_servico: 'Rua A', descricao: 'Reparo', inicio_previsto: '2026-11-07',
          fim_previsto: '2026-11-08', comunicado_em: '2026-11-07T20:00:00Z', ocorrido_em: '2026-11-07T18:00:00Z',
          protocolo_cisp: 'PROTO-1', inicio_lat: -22.9, inicio_lng: -43.12, fim_lat: null, fim_lng: null,
        },
        {
          id: '00000000-0000-4000-8000-000000009902', empresa_id: 'ter1', tipo: 'programado', tipo_servico: 'Manutenção de rede',
          responsavel: 'Fulano', placas: ['DEF5678'], local_servico: 'Rua B', descricao: 'Manutenção', inicio_previsto: '2026-12-10',
          fim_previsto: '2026-12-12', comunicado_em: '2026-12-01T10:00:00Z', ocorrido_em: null, protocolo_cisp: null,
          inicio_lat: -22.91, inicio_lng: -43.13, fim_lat: -22.912, fim_lng: -43.132,
        },
      ],
    });
    await page.goto('/consulta/obras');

    const legenda = page.getByRole('list', { name: 'Legenda das comunicações ao CISP' });
    await expect(legenda).toContainText('Emergência (comunicada depois do fato)');
    await expect(legenda).toContainText('Serviço programado (comunicado antes)');
    await expect.poll(() => backend.de('comunicacoes_publicas').length).toBeGreaterThan(0);
  });

  test('sem comunicações, a legenda não aparece', async ({ page }) => {
    await instalarBackend(page, { comunicacoes: [] });
    await page.goto('/consulta/obras');
    await expect(page.getByRole('list', { name: 'Legenda das comunicações ao CISP' })).toHaveCount(0);
  });
});
