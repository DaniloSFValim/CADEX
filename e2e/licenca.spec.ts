import { expect, test, type Page } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca } from './apoio/dados';

/**
 * O campo de um formulário, achado pelo texto do próprio rótulo (e não por uma dica
 * que cite o mesmo nome: "assume a data da decisão" não é o campo "Data da decisão").
 */
const rotulo = (page: Page, texto: string) =>
  page.locator(`label:has(> span:text-matches("^${texto}[*]?$"))`).first();
const campo = (page: Page, texto: string) => rotulo(page, texto).locator('input, select, textarea').first();
const lista = campo;
const caixa = (page: Page) => page.getByLabel('A própria contratante executará a obra ou serviço.');

/** Preenche o mínimo que o formulário exige, sem escolher contratante nem executora. */
async function preencherBasico(page: Page) {
  await campo(page, 'Nº do processo').fill('NIT-050120/000900/2026');
  await lista(page, 'Tipo de intervenção').selectOption('obra');
  await page.locator('label:has-text("Abertura de vala") input').check();
  await campo(page, 'Escopo da obra').fill('Vala para rede');
  await campo(page, 'Data da decisão').fill(dia(0));
  await campo(page, 'Nº da licença').fill('900/2026');
  await campo(page, 'Fim da obra ou serviço').fill(dia(30));
  await campo(page, 'Logradouro').fill('Rua Mem de Sá');
  await page.getByPlaceholder('-22.895000, -43.123000').first().fill('-22.905, -43.110');
}

test.describe('registro de licença', () => {
  test('não oferece "Indeferida" e nomeia as datas do período', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await expect(page.getByRole('heading', { name: 'Registrar licença' })).toBeVisible();

    await expect(lista(page, 'Situação').locator('option')).toHaveText(['Em execução', 'Concluída', 'Cancelada']);
    await expect(rotulo(page, 'Início da obra ou serviço')).toBeVisible();
    await expect(rotulo(page, 'Fim da obra ou serviço')).toBeVisible();
    await expect(page.getByText('Fim do cronograma')).toHaveCount(0);
  });

  test('licença que já está indeferida (histórico) continua mostrando a situação gravada', async ({ page }) => {
    const l = licenca({ situacao: 'indeferida', concluida_em: null });
    await instalarBackend(page, { licencas: [l] });
    await page.goto(`/obras/${l.id}`);
    await expect(page.getByRole('heading', { name: /Licença|Pedido de licença/ })).toBeVisible();
    await expect(lista(page, 'Situação').locator('option')).toContainText(['Indeferida']);
    await expect(lista(page, 'Situação')).toHaveValue('indeferida');
  });

  test('fim anterior ao início é barrado, antes de enviar', async ({ page }) => {
    const backend = await instalarBackend(page);
    await page.goto('/obras/nova');
    await lista(page, 'Contratante').selectOption('op1');
    await lista(page, 'Executora').selectOption('ter1');
    await preencherBasico(page);
    await campo(page, 'Início da obra ou serviço').fill(dia(40));

    // Pelo navegador: o campo de fim tem o início como mínimo.
    const fim = campo(page, 'Fim da obra ou serviço');
    expect(await fim.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);

    // Pela regra da aplicação, mesmo sem a validação do navegador.
    await page.locator('form').evaluate((f: HTMLFormElement) => { f.noValidate = true; });
    await page.getByRole('button', { name: 'Registrar licença' }).click();
    await expect(page.getByRole('alert')).toContainText('O fim da obra ou serviço não pode ser anterior ao início.');
    expect(backend.de('rpc/salvar_licenca')).toHaveLength(0);
  });

  test('a própria contratante executa: a executora acompanha, trava, e o envio leva a mesma empresa', async ({ page }) => {
    const backend = await instalarBackend(page);
    await page.goto('/obras/nova');

    // Sem contratante a opção não está disponível.
    await expect(caixa(page)).toBeDisabled();
    await expect(page.getByText('Escolha a contratante entre as empresas cadastradas.')).toBeVisible();

    await lista(page, 'Contratante').selectOption('op1');
    await expect(caixa(page)).toBeEnabled();
    await caixa(page).check();
    await expect(lista(page, 'Executora')).toHaveValue('op1');
    await expect(lista(page, 'Executora')).toBeDisabled();

    // Trocar a contratante leva a executora junto.
    await lista(page, 'Contratante').selectOption('op2');
    await expect(lista(page, 'Executora')).toHaveValue('op2');
    await expect(caixa(page)).toBeChecked();

    await lista(page, 'Contratante').selectOption('op1');
    await preencherBasico(page);
    await page.getByRole('button', { name: 'Registrar licença' }).click();

    await expect.poll(() => backend.de('rpc/salvar_licenca').length).toBe(1);
    const { p_licenca } = backend.de('rpc/salvar_licenca')[0].corpo as { p_licenca: Record<string, unknown> };
    expect(p_licenca.contratante_id).toBe('op1');
    expect(p_licenca.executora_id).toBe('op1');
    expect(p_licenca.situacao).toBe('deferida');
  });

  test('desmarcar libera a executora; mudar para origem pública desfaz a execução própria', async ({ page }) => {
    await instalarBackend(page, {
      orgaos: [{ id: 'og1', nome: 'Secretaria de Mobilidade', sigla: 'SEMOB', esfera: 'municipal', cnpj: null, setores: [],
        natureza: 'administracao_direta', criado_em: '2026-01-01', atualizado_em: '2026-01-01' }],
    });
    await page.goto('/obras/nova');
    await lista(page, 'Contratante').selectOption('op1');
    await caixa(page).check();
    await caixa(page).uncheck();
    await expect(lista(page, 'Executora')).toBeEnabled();
    await expect(lista(page, 'Executora')).toHaveValue('');

    await caixa(page).check();
    await lista(page, 'Origem da intervenção').selectOption('municipio');
    // Em contrato público a execução é da empresa contratada: a opção some e a executora é escolhida de novo.
    await expect(caixa(page)).toHaveCount(0);
    await expect(lista(page, 'Contratante')).toHaveValue('');
    await expect(lista(page, 'Executora')).toHaveValue('');
    await expect(lista(page, 'Contratante').locator('option')).toHaveText(['Selecione', 'SEMOB — Secretaria de Mobilidade']);
  });

  test('empresa que não está habilitada não pode ser contratante e executora ao mesmo tempo', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await lista(page, 'Contratante').selectOption('inap');
    await expect(caixa(page)).toBeDisabled();
    await expect(page.getByText('Esta empresa não está habilitada a executar neste setor.')).toBeVisible();
  });

  test('empresa cujo cadastro não marca execução própria não pode ser a própria executora', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await lista(page, 'Contratante').selectOption('op3');
    await expect(caixa(page)).toBeDisabled();
    await expect(page.getByText('O cadastro desta empresa não marca que ela executa obras ou serviços por conta própria.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir o cadastro' })).toHaveAttribute('href', '/empresas/op3');
    // A executora só pode ser terceirizada: a própria contratante não está na lista.
    await expect(lista(page, 'Executora').locator('option')).toHaveText(['Selecione', 'Terceirizada Alfa Ltda.']);
  });

  test('tipo de intervenção é obrigatório e vai ao banco; serviço muda o rótulo do escopo', async ({ page }) => {
    const backend = await instalarBackend(page);
    await page.goto('/obras/nova');
    await expect(lista(page, 'Tipo de intervenção').locator('option')).toHaveText(['Selecione', 'Obra', 'Serviço']);
    await expect(lista(page, 'Origem da intervenção').locator('option')).toHaveText([
      'Concessionária ou prestadora de serviço', 'Prefeitura ou órgão municipal', 'Autarquia municipal', 'Órgão estadual ou federal']);
    await lista(page, 'Contratante').selectOption('op1');
    await lista(page, 'Executora').selectOption('ter1');
    await preencherBasico(page);
    await lista(page, 'Tipo de intervenção').selectOption('');
    await page.getByRole('button', { name: 'Registrar licença' }).click();
    // Pelo navegador (select obrigatório) e, sem ele, pela regra da aplicação.
    expect(await lista(page, 'Tipo de intervenção').evaluate((el: HTMLSelectElement) => el.validity.valueMissing)).toBe(true);
    await page.locator('form').evaluate((f: HTMLFormElement) => { f.noValidate = true; });
    await page.getByRole('button', { name: 'Registrar licença' }).click();
    await expect(page.getByRole('alert')).toContainText('Escolha o tipo de intervenção: obra ou serviço.');
    expect(backend.de('rpc/salvar_licenca')).toHaveLength(0);

    await lista(page, 'Tipo de intervenção').selectOption('servico');
    await expect(rotulo(page, 'Escopo do serviço')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar licença' }).click();
    await expect.poll(() => backend.de('rpc/salvar_licenca').length).toBe(1);
    const { p_licenca } = backend.de('rpc/salvar_licenca')[0].corpo as { p_licenca: Record<string, unknown> };
    expect(p_licenca).toMatchObject({ tipo_intervencao: 'servico', origem_intervencao: 'concessionaria' });
  });

  test('obra pública: o contratante é o órgão certo, a executora é a empreiteira, e há campos de contrato', async ({ page }) => {
    const backend = await instalarBackend(page, {
      orgaos: [
        { id: 'prefeitura', nome: 'Secretaria de Obras', sigla: 'SMO', esfera: 'municipal', cnpj: null, setores: [], natureza: 'administracao_direta', criado_em: '2026-01-01', atualizado_em: '2026-01-01' },
        { id: 'autarquia', nome: 'Autarquia de Obras', sigla: 'AUTOB', esfera: 'municipal', cnpj: null, setores: [], natureza: 'autarquia', criado_em: '2026-01-01', atualizado_em: '2026-01-01' },
        { id: 'estado', nome: 'Governo do Estado', sigla: 'GERJ', esfera: 'estadual', cnpj: null, setores: [], natureza: 'administracao_direta', criado_em: '2026-01-01', atualizado_em: '2026-01-01' },
      ],
    });
    await page.goto('/obras/nova');
    await expect(page.getByRole('heading', { name: 'Contrato público' })).toHaveCount(0);

    await lista(page, 'Origem da intervenção').selectOption('municipio');
    await expect(lista(page, 'Contratante').locator('option')).toHaveText(['Selecione', 'SMO — Secretaria de Obras']);
    await lista(page, 'Origem da intervenção').selectOption('autarquia');
    await expect(lista(page, 'Contratante').locator('option')).toHaveText(['Selecione', 'AUTOB — Autarquia de Obras']);
    await lista(page, 'Origem da intervenção').selectOption('outro_ente');
    await expect(lista(page, 'Contratante').locator('option')).toHaveText(['Selecione', 'GERJ — Governo do Estado']);

    await lista(page, 'Origem da intervenção').selectOption('autarquia');
    await lista(page, 'Contratante').selectOption('orgao:autarquia');
    await lista(page, 'Executora').selectOption('ter1');
    await expect(page.getByRole('heading', { name: 'Contrato público' })).toBeVisible();
    await campo(page, 'Nº do contrato').fill('CT 12/2026');
    await preencherBasico(page);
    await page.getByRole('button', { name: 'Registrar licença' }).click();

    await expect.poll(() => backend.de('rpc/salvar_licenca').length).toBe(1);
    const { p_licenca } = backend.de('rpc/salvar_licenca')[0].corpo as { p_licenca: Record<string, unknown> };
    expect(p_licenca).toMatchObject({
      tipo_intervencao: 'obra', origem_intervencao: 'autarquia', orgao_contratante_id: 'autarquia',
      contratante_id: null, executora_id: 'ter1', contrato_numero: 'CT 12/2026',
    });
  });

  test('havendo contratante, a executora é terceirizada ou a própria contratante', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/obras/nova');
    await lista(page, 'Contratante').selectOption('op1');
    // Operadora Dois não pode executar para a Operadora Um.
    await expect(lista(page, 'Executora').locator('option')).toHaveText(['Selecione', 'OpUm', 'Terceirizada Alfa Ltda.']);
  });
});
