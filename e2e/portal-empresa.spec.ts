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
    await campo('Responsável').fill('Fulano de Tal');
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
});
