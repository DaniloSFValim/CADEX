import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

// Datas relativas a hoje em Niterói, para o filtro padrão (só o que acontece hoje) ser previsível.
function diaDeslocado(dias: number): string {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

test.describe('comunicações ao CISP na consulta pública', () => {
  test('por padrão mostra só o que acontece hoje; o filtro amplia a janela', async ({ page }) => {
    const backend = await instalarBackend(page, {
      comunicacoes: [
        {
          id: '00000000-0000-4000-8000-000000009901', empresa_id: 'ter1', tipo: 'emergencia', tipo_servico: 'Rompimento de cabo',
          responsavel: 'Plantão', placas: ['ABC1234'], local_servico: 'Rua A', descricao: 'Reparo', inicio_previsto: diaDeslocado(0),
          fim_previsto: diaDeslocado(0), comunicado_em: new Date().toISOString(), ocorrido_em: new Date().toISOString(),
          protocolo_cisp: 'PROTO-1', inicio_lat: -22.9, inicio_lng: -43.12, fim_lat: null, fim_lng: null,
        },
        {
          id: '00000000-0000-4000-8000-000000009902', empresa_id: 'ter1', tipo: 'programado', tipo_servico: 'Manutenção de rede',
          responsavel: 'Fulano', placas: ['DEF5678'], local_servico: 'Rua B', descricao: 'Manutenção', inicio_previsto: diaDeslocado(5),
          fim_previsto: diaDeslocado(7), comunicado_em: new Date().toISOString(), ocorrido_em: null, protocolo_cisp: null,
          inicio_lat: -22.91, inicio_lng: -43.13, fim_lat: -22.912, fim_lng: -43.132,
        },
      ],
    });
    await page.goto('/consulta/obras');

    const legenda = page.getByRole('list', { name: 'Legenda das comunicações ao CISP' });
    await expect(legenda).toContainText('Emergência (comunicada depois do fato)');
    await expect(legenda).toContainText('Serviço programado (comunicado antes)');
    await expect(page.getByText('Mostrando só o que acontece hoje: 1 de 2 comunicações')).toBeVisible();

    await page.getByRole('checkbox', { name: /Mostrar os próximos 15 dias/ }).check();
    await expect(page.getByText('Mostrando 2 de 2 comunicações')).toBeVisible();
    await expect.poll(() => backend.de('comunicacoes_publicas').length).toBeGreaterThan(0);
  });

  test('sem comunicações, a legenda e o filtro não aparecem', async ({ page }) => {
    await instalarBackend(page, { comunicacoes: [] });
    await page.goto('/consulta/obras');
    await expect(page.getByRole('list', { name: 'Legenda das comunicações ao CISP' })).toHaveCount(0);
    await expect(page.getByRole('section', { name: 'Filtro das comunicações ao CISP' })).toHaveCount(0);
  });
});
