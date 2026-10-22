import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, empresa, licenca, uuid } from './apoio/dados';
import type { Conta } from '../src/lib/contas';
import type { EventoAuditoria } from '../src/lib/auditoria';

const conta = (n: number, nome: string | null, papel: Conta['papel'], ativo: boolean): Conta => ({
  user_id: uuid(n), email: `${nome ? nome.toLowerCase().replace(/\s+/g, '.') : 'sem.acesso'}@teste`, nome, papel,
  administrador: false, ativo, criado_em: '2026-01-01T00:00:00Z', ultimo_acesso: null, mfa_ativa: false,
});

const contas = () => [
  conta(1, 'Gestor Comum', 'gestor', true),
  conta(2, 'Consulta Cisp', 'cisp', false),
  conta(3, null, null, false),
];

test.describe('administração: acesso', () => {
  test('quem não é administrador não vê o menu e é barrado na URL', async ({ page }) => {
    await instalarBackend(page, { administrador: false });
    await page.goto('/admin');
    await expect(page.getByText('Só administrador acessa a administração do CADEX.')).toBeVisible();
    await expect(page.locator('header nav').getByRole('link', { name: 'Administração' })).toHaveCount(0);
  });

  test('o administrador vê o menu e as sete áreas', async ({ page }) => {
    await instalarBackend(page, { administrador: true, contas: contas() });
    await page.goto('/admin');
    await expect(page.locator('header nav').getByRole('link', { name: 'Administração' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Administração"] a')).toHaveText(
      ['Contas e acessos', 'Empresas', 'Licenças', 'Tipos de obra', 'Órgãos', 'Configurações', 'Auditoria']);
  });

  test('/contas leva à administração', async ({ page }) => {
    await instalarBackend(page, { administrador: true, contas: contas() });
    await page.goto('/contas');
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe('administração: contas', () => {
  test('desativar e reativar um acesso envia a chamada certa e atualiza a lista', async ({ page }) => {
    const backend = await instalarBackend(page, { administrador: true, contas: contas() });
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Com acesso (2)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acesso desativado (1)' })).toBeVisible();

    // Você não se desativa; o outro, sim, depois de confirmar.
    await expect(page.locator('tr', { hasText: 'voce@teste' }).getByRole('button', { name: 'Desativar acesso' })).toHaveCount(0);
    const linha = page.locator('tr', { hasText: 'gestor.comum@teste' });
    await linha.getByRole('button', { name: 'Desativar acesso' }).click();
    await expect(linha).toContainText('mesmo com a sessão aberta');
    expect(backend.de('rpc/admin_definir_ativo')).toHaveLength(0);
    await linha.getByRole('button', { name: 'Confirmar desativação' }).click();

    await expect.poll(() => backend.de('rpc/admin_definir_ativo').length).toBe(1);
    expect(backend.de('rpc/admin_definir_ativo')[0].corpo).toEqual({ p_user_id: uuid(1), p_ativo: false });
    await expect(page.getByRole('heading', { name: 'Acesso desativado (2)' })).toBeVisible();

    await page.locator('tr', { hasText: 'consulta.cisp@teste' }).getByRole('button', { name: 'Reativar acesso' }).click();
    await expect.poll(() => backend.de('rpc/admin_definir_ativo').length).toBe(2);
    expect(backend.de('rpc/admin_definir_ativo')[1].corpo).toEqual({ p_user_id: uuid(2), p_ativo: true });
  });
});

test.describe('administração: empresas', () => {
  const cenario = () => ({
    administrador: true,
    empresas: [
      empresa('a', 'Telemar Norte Leste S.A.', 'operadora', { cnpj: '33000167000101' }),
      empresa('b', 'TELEMAR NORTE LESTE SA', 'operadora', { cnpj: '44000167000101' }),
      empresa('c', 'Terceirizada Alfa Ltda.', 'terceirizada', { cnpj: '55000167000101' }),
    ],
    licencas: [licenca({ executora_id: 'c', contratante_id: 'a' }), licenca({ executora_id: 'c', contratante_id: 'a' })],
  });

  test('mostra a participação por papel e o cadastro parecido', async ({ page }) => {
    await instalarBackend(page, cenario());
    await page.goto('/admin/empresas');
    await expect(page.locator('tr', { hasText: 'Terceirizada Alfa' })).toContainText('2 licenças');
    await expect(page.locator('tr', { hasText: 'Terceirizada Alfa' })).toContainText('2 como executora');
    await expect(page.locator('tr', { hasText: 'Telemar Norte Leste S.A.' })).toContainText('2 como contratante');
    await expect(page.getByText('Mesmo nome')).toBeVisible();
  });

  test('desativar envia o PATCH da empresa certa, só depois de confirmar', async ({ page }) => {
    const backend = await instalarBackend(page, cenario());
    await page.goto('/admin/empresas');
    const linha = page.locator('tr', { hasText: 'Terceirizada Alfa' });
    await linha.getByRole('button', { name: 'Desativar' }).click();
    await expect(linha).toContainText('Deixa de poder ser escolhida em licença nova');
    expect(backend.de('empresas', 'PATCH')).toHaveLength(0);

    await linha.getByRole('button', { name: 'Confirmar' }).click();
    await expect.poll(() => backend.de('empresas', 'PATCH').length).toBe(1);
    const patch = backend.de('empresas', 'PATCH')[0];
    expect(patch.consulta.get('id')).toBe('eq.c');
    expect(patch.corpo).toEqual({ ativa: false });
    await expect(linha).toContainText('Desativada');
    await expect(linha.getByRole('button', { name: 'Reativar' })).toBeVisible();
  });

  test('empresa desativada não aparece para escolha numa licença nova', async ({ page }) => {
    await instalarBackend(page, {
      administrador: true,
      empresas: [empresa('op1', 'Operadora Um S.A.', 'operadora'), empresa('ter1', 'Terceirizada Alfa Ltda.', 'terceirizada', { ativa: false })],
    });
    await page.goto('/obras/nova');
    const executora = page.locator('label:has(> span:text-matches("^Executora[*]?$")) select');
    await expect(executora.locator('option')).toHaveText(['Selecione', 'Operadora Um S.A.']);
  });
});

test.describe('administração: licenças e auditoria', () => {
  const evento = (id: number, extra: Partial<EventoAuditoria>): EventoAuditoria => ({
    id, em: '2026-10-13T14:00:00Z', por: uuid(1), por_nome: 'Admin Um', tabela: 'licencas', registro_id: null, empresas: [],
    operacao: 'UPDATE', antes: null, depois: null, ...extra,
  });

  test('licenças a revisar apontam o problema, e "Histórico" abre a auditoria filtrada', async ({ page }) => {
    const l = licenca({ inicio_previsto: dia(-90), fim_previsto: dia(-30) });
    const backend = await instalarBackend(page, {
      administrador: true, licencas: [l, licenca()],
      auditoria: [
        evento(1, { registro_id: l.id, antes: { observacoes: null }, depois: { observacoes: '<b>negrito</b>' } }),
        evento(2, { registro_id: uuid(999), depois: { observacoes: 'de outra licença' } }),
      ],
    });
    await page.goto('/admin/licencas');
    await expect(page.getByRole('heading', { name: 'Registros a revisar (1)' })).toBeVisible();
    await expect(page.locator('tbody')).toContainText('Fim da obra ou serviço vencido, sem conclusão registrada.');

    await page.getByRole('link', { name: 'Histórico' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/auditoria\\?tabela=licencas&registro=${l.id}`));
    await expect(page.locator('input[placeholder^="Ex.:"]')).toHaveValue(l.id);

    // A busca vai ao banco com os filtros, e só o evento dessa licença aparece.
    await expect.poll(() => backend.de('auditoria').some((c) => c.consulta.get('registro_id') === `eq.${l.id}`)).toBe(true);
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // O valor com HTML aparece como texto, sem virar marcação.
    await page.locator('summary', { hasText: 'Alterou' }).click();
    await expect(page.locator('tbody')).toContainText('<b>negrito</b>');
    await expect(page.locator('tbody b')).toHaveCount(0);
  });

  test('código de registro inválido é recusado sem ir ao banco', async ({ page }) => {
    const backend = await instalarBackend(page, { administrador: true });
    await page.goto('/admin/auditoria');
    await expect.poll(() => backend.de('auditoria').length).toBeGreaterThan(0);
    const antes = backend.de('auditoria').length;
    await page.locator('input[placeholder^="Ex.:"]').fill("1' or '1'='1");
    await expect(page.getByRole('alert')).toContainText('O código do registro não é válido.');
    expect(backend.de('auditoria').length).toBe(antes);
  });

  test('configurações mostram a contagem de contas ativas por perfil', async ({ page }) => {
    await instalarBackend(page, { administrador: true, contas: contas() });
    await page.goto('/admin/configuracoes');
    await expect(page.getByRole('heading', { name: 'Perfis de acesso' })).toBeVisible();
    // Você (administrador, SECONSER) e o gestor comum: duas contas ativas no perfil SECONSER.
    await expect(page.locator('tr', { hasText: 'SECONSER' }).first()).toContainText('2');
    await expect(page.getByText('Prazos e parâmetros')).toBeVisible();
  });
});

test.describe('administração: exclusão de empresa', () => {
  test('empresa em análise sem licença: só excluir, com o CNPJ digitado; a exclusão vai ao banco', async ({ page }) => {
    const backend = await instalarBackend(page, {
      administrador: true,
      empresas: [empresa('em1', 'Em Análise Um Ltda.', 'terceirizada', { situacao: 'em_analise', cnpj: '33000167000101' })],
    });
    await page.goto('/admin/empresas');
    const linha = page.getByRole('row', { name: /Em Análise Um Ltda/ });
    await expect(linha.getByRole('button', { name: 'Desativar' })).toHaveCount(0);
    await linha.getByRole('button', { name: 'Excluir', exact: true }).click();

    const confirmar = linha.getByRole('button', { name: 'Excluir', exact: true });
    await expect(confirmar).toBeDisabled();
    await linha.getByLabel(/Digite o CNPJ/).fill('33.000.167/0001-01');
    await expect(confirmar).toBeEnabled();
    await confirmar.click();

    await expect.poll(() => backend.de('rpc/admin_excluir_empresa').length).toBe(1);
    const { p_id } = backend.de('rpc/admin_excluir_empresa')[0].corpo as { p_id: string };
    expect(p_id).toBe('em1');
  });
});
