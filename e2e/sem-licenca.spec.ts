import { expect, test, type Page } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { uuid } from './apoio/dados';
import type { Orgao } from '../src/lib/orgaos';

const orgao = (id: string, sigla: string, nome: string): Orgao => ({
  id, nome, sigla, esfera: 'municipal', cnpj: null, setores: [], natureza: 'administracao_direta',
  criado_em: '2026-01-01', atualizado_em: '2026-01-01',
});

/** Campo pelo rótulo exato do formulário. */
const campo = (page: Page, texto: string) =>
  page.locator(`label:has(> span:text-matches("^${texto}[*]?$"))`).first().locator('input, select, textarea').first();

const orgaos = [orgao('sec', 'SECONSER', 'Secretaria de Conservação'), orgao('semob', 'SEMOB', 'Secretaria de Mobilidade')];

test.describe('obras e serviços sem licença', () => {
  test('gestor registra serviço próprio do órgão, sem empresa e sem licença', async ({ page }) => {
    const backend = await instalarBackend(page, { orgaos });
    await page.goto('/obras/sem-licenca/nova');
    await campo(page, 'Tipo').selectOption('servico');
    await page.getByLabel('Outros (descrever)').check();
    await page.getByLabel(/Descreva o tipo/).fill('Poda de árvores');
    await campo(page, 'Escopo').fill('Poda de árvores na praça');
    await campo(page, 'Órgão contratante').selectOption('sec');
    await campo(page, 'Quem executa').selectOption('propria_orgao');
    await campo(page, 'Logradouro').fill('Rua Visconde do Rio Branco');
    await page.getByPlaceholder('-22.895000, -43.123000').fill('-22.8955, -43.1245');
    await page.getByRole('button', { name: 'Registrar' }).click();

    await expect(page).toHaveURL(/\/obras\/sem-licenca$/);
    await expect(page.getByRole('status')).toContainText('Obra ou serviço sem licença registrado.');
    await expect.poll(() => backend.de('intervencoes_sem_licenca', 'POST').length).toBe(1);
    const corpo = backend.de('intervencoes_sem_licenca', 'POST')[0].corpo as Record<string, unknown>;
    expect(corpo).toMatchObject({
      tipo_intervencao: 'servico', tipos_obra: ['outros'], outros_descricao: 'Poda de árvores',
      contratante_orgao_id: 'sec', executora_modo: 'propria_orgao',
      executora_id: null, executora_razao_social: null, licenca_id: null, processo_sei: null,
    });
    // Nada de licença: o envio não passa pela função de licença.
    expect(backend.de('rpc/salvar_licenca')).toHaveLength(0);
  });

  test('empresa fora do cadastro exige a razão social antes de enviar', async ({ page }) => {
    const backend = await instalarBackend(page, { orgaos });
    await page.goto('/obras/sem-licenca/nova');
    await campo(page, 'Tipo').selectOption('obra');
    await page.getByLabel('Bicicletário').check();
    await campo(page, 'Escopo').fill('Galeria');
    await campo(page, 'Órgão contratante').selectOption('semob');
    await campo(page, 'Quem executa').selectOption('sem_cadastro');
    await campo(page, 'Logradouro').fill('Rua Otávio Carneiro');
    await page.getByPlaceholder('-22.895000, -43.123000').fill('-22.9010, -43.1180');
    await page.locator('form').evaluate((f: HTMLFormElement) => { f.noValidate = true; });
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByRole('alert')).toContainText('Informe a razão social da empresa executora.');
    expect(backend.de('intervencoes_sem_licenca', 'POST')).toHaveLength(0);

    await campo(page, 'Razão social da empresa').fill('Construtora Externa Ltda.');
    await campo(page, 'CNPJ').fill('24.144.040/0001-75');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect.poll(() => backend.de('intervencoes_sem_licenca', 'POST').length).toBe(1);
    const corpo = backend.de('intervencoes_sem_licenca', 'POST')[0].corpo as Record<string, unknown>;
    expect(corpo).toMatchObject({ executora_modo: 'sem_cadastro', executora_razao_social: 'Construtora Externa Ltda.', executora_cnpj: '24144040000175' });
  });

  test('a lista mostra os registros; quem só consulta não vê o botão de registrar', async ({ page }) => {
    await instalarBackend(page, {
      orgaos,
      perfil: 'cisp',
      semLicenca: [{
        id: uuid(7001), setor: 'viario', tipo_intervencao: 'servico', tipos_obra: ['outros'], outros_descricao: 'Poda de árvores',
        escopo: 'Poda de árvores na praça', contratante_orgao_id: 'sec',
        executora_modo: 'propria_orgao', executora_id: null, executora_razao_social: null, executora_cnpj: null,
        logradouro: 'Rua Visconde do Rio Branco', bairro: null, referencia: null, inicio_lat: -22.8955, inicio_lng: -43.1245,
        fim_lat: null, fim_lng: null, inicio_previsto: null, fim_previsto: null, situacao: 'em_execucao', concluida_em: null,
        processo_sei: null, contrato_numero: null, processo_administrativo: null, ordem_servico_numero: null, observacoes: null,
        licenca_id: null, atualizado_em: '2026-10-14T10:00:00Z',
      }],
    });
    await page.goto('/obras/sem-licenca');
    await expect(page.getByText('Poda de árvores na praça')).toBeVisible();
    await expect(page.getByText('Própria do órgão')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Registrar sem licença' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
  });
});
