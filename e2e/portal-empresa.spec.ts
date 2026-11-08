import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { empresasPadrao, licenca } from './apoio/dados';

// Representante de empresa: entra pelo portal, sem cadastro de servidor. A empresa de teste é a ter1.
const acesso = (ativo = true) => ({
  empresa_id: 'ter1', papel: 'representante' as const, nome: 'Maria Representante', email: 'maria@alfa.test', ativo,
});

const licencas = () => [
  licenca({ numero: 'LIC-DA-EMPRESA', executora_id: 'ter1', contratante_id: 'op1' }),
  licenca({ numero: 'LIC-DE-OUTRA', executora_id: 'op2', contratante_id: 'op2' }),
];

test.describe('portal das empresas', () => {
  test('o representante vê só a própria empresa e as próprias licenças, sem área de servidor', async ({ page }) => {
    await instalarBackend(page, { empresas: empresasPadrao(), licencas: licencas(), acessoEmpresa: acesso() });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Terceirizada Alfa Ltda.' })).toBeVisible();
    await expect(page.getByText('Portal das empresas · Representante')).toBeVisible();
    await expect(page.getByText('Licença LIC-DA-EMPRESA')).toBeVisible();
    await expect(page.getByText('LIC-DE-OUTRA')).toHaveCount(0);
    await expect(page.getByText('Operadora Um S.A.')).toHaveCount(0);

    // Cadastro é só leitura; a empresa não edita nem acessa o painel de servidor.
    await expect(page.getByRole('button', { name: 'Editar dados' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Painel|Administração/ })).toHaveCount(0);
  });

  test('a empresa registra comunicação de serviço programado da própria empresa', async ({ page }) => {
    const backend = await instalarBackend(page, { empresas: empresasPadrao(), licencas: licencas(), acessoEmpresa: acesso() });
    await page.goto('/');

    await page.getByRole('button', { name: 'Nova comunicação' }).click();
    const campo = (nome: string) => page.getByLabel(new RegExp(`^${nome}`));
    const amanha = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const depois = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    await campo('Tipo de serviço').fill('Reparo de rede');
    await campo('Responsável').fill('Fulano de Tal');
    await campo('Ponto \\(coordenadas\\)').fill('-22.900000, -43.120000');
    await campo('Placas dos veículos').fill('abc-1234');
    await campo('Local do serviço').fill('Rua B, 20');
    await campo('Descrição do serviço').fill('Reparo de rede');
    await campo('Início previsto').fill(amanha);
    await campo('Fim previsto').fill(depois);
    await page.getByRole('button', { name: 'Registrar comunicação' }).click();

    await expect.poll(() => backend.de('comunicacoes_servico', 'POST').length).toBe(1);
    const corpo = backend.de('comunicacoes_servico', 'POST')[0].corpo as Record<string, unknown>;
    expect(corpo).toMatchObject({ empresa_id: 'ter1', responsavel: 'Fulano de Tal', placas: ['ABC1234'], tipo: 'programado' });
    await expect(page.getByRole('status')).toContainText('Comunicação registrada para Fulano de Tal');
  });

  test('acesso desativado não entra no portal', async ({ page }) => {
    await instalarBackend(page, { empresas: empresasPadrao(), licencas: licencas(), acessoEmpresa: acesso(false) });
    await page.goto('/');
    await expect(page.getByText('não está autorizado')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Terceirizada Alfa Ltda.' })).toHaveCount(0);
  });
  test('emergência: registro depois do fato, com o protocolo do 153 e o local no mapa', async ({ page }) => {
    const backend = await instalarBackend(page, { empresas: empresasPadrao(), licencas: licencas(), acessoEmpresa: acesso() });
    await page.goto('/');

    await page.getByRole('button', { name: 'Nova comunicação' }).click();
    await page.getByRole('radio', { name: 'Emergência' }).check();
    await expect(page.getByRole('note')).toContainText('Ligue para o 153');
    const campo = (nome: string) => page.getByLabel(new RegExp(`^${nome}`));
    const termino = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    await campo('Tipo de serviço').fill('Rompimento de cabo');
    await campo('Responsável').fill('Plantão');
    await campo('Placas dos veículos').fill('abc1234');
    await campo('Local do serviço').fill('Rua B, 20');
    await campo('Descrição do serviço').fill('Reparo emergencial');
    await campo('Ponto \\(coordenadas\\)').fill('-22.900000, -43.120000');
    // Duas horas atrás, no formato datetime-local da hora local do próprio navegador.
    const horaLocal = await page.evaluate(() => {
      const d = new Date(Date.now() - 2 * 3600_000);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    });
    await campo('Data e hora do fato').fill(horaLocal);
    await campo('Protocolo do 153').fill('PROTO-2026-77');
    await campo('Previsão de término').fill(termino);
    await page.getByRole('button', { name: 'Registrar comunicação' }).click();

    await expect.poll(() => backend.de('comunicacoes_servico', 'POST').length).toBe(1);
    const corpo = backend.de('comunicacoes_servico', 'POST')[0].corpo as Record<string, unknown>;
    expect(corpo).toMatchObject({
      empresa_id: 'ter1', tipo: 'emergencia', tipo_servico: 'Rompimento de cabo', placas: ['ABC1234'],
      protocolo_cisp: 'PROTO-2026-77', inicio_lat: -22.9, inicio_lng: -43.12, inicio_previsto: expect.any(String),
    });
    expect(typeof corpo.ocorrido_em).toBe('string');
    await expect(page.getByRole('status')).toContainText('Emergência registrada para Plantão');
  });
});
