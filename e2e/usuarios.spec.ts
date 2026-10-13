import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { uuid } from './apoio/dados';
import type { Conta } from '../src/lib/contas';

const conta = (n: number, nome: string | null, papel: Conta['papel'], ativo: boolean, admin = false): Conta => ({
  user_id: uuid(n), email: `${nome ? nome.toLowerCase().replace(/\s+/g, '.') : 'sem.acesso'}@teste`, nome, papel,
  administrador: admin, ativo, criado_em: '2026-01-01T00:00:00Z', ultimo_acesso: '2026-10-10T12:00:00Z', mfa_ativa: false,
});

const contas = () => [
  conta(1, 'Gestor Comum', 'gestor', true),
  conta(2, 'Consulta Cisp', 'cisp', false),
  conta(3, null, null, false),
  conta(4, 'Outro Admin', 'gestor', true, true),
];

test.describe('exclusão de usuário', () => {
  test('você não vê a ação sobre a própria conta', async ({ page }) => {
    await instalarBackend(page, { administrador: true, contas: contas() });
    await page.goto('/admin');
    await expect(page.locator('tr', { hasText: 'voce@teste' }).getByRole('button', { name: 'Excluir usuário' })).toHaveCount(0);
    await expect(page.locator('tr', { hasText: 'gestor.comum@teste' }).getByRole('button', { name: 'Excluir usuário' })).toBeVisible();
  });

  test('mostra quem é, avisa das consequências, exige o e-mail e só então exclui', async ({ page }) => {
    const backend = await instalarBackend(page, { administrador: true, contas: contas() });
    await page.goto('/admin');
    const linha = page.locator('tr', { hasText: 'gestor.comum@teste' });
    await linha.getByRole('button', { name: 'Excluir usuário' }).click();

    const painel = page.getByRole('group', { name: 'Confirmar exclusão do usuário' });
    await expect(painel).toContainText('Gestor Comum');
    await expect(painel).toContainText('gestor.comum@teste');
    await expect(painel).toContainText('Não dá para desfazer');
    await expect(painel).toContainText('continua na auditoria');
    await expect(painel).toContainText('2 documentos enviados');
    await expect(painel).toContainText('7 eventos na auditoria');

    const confirmar = painel.getByRole('button', { name: 'Confirmar exclusão' });
    await expect(confirmar).toBeDisabled();
    await painel.getByLabel('Para confirmar, digite o e-mail da conta').fill('outra@pessoa');
    await expect(confirmar).toBeDisabled();

    // Cancelar não envia nada.
    await painel.getByRole('button', { name: 'Cancelar' }).click();
    expect(backend.de('functions/v1/admin-contas')).toHaveLength(0);

    await linha.getByRole('button', { name: 'Excluir usuário' }).click();
    await painel.getByLabel('Para confirmar, digite o e-mail da conta').fill('Gestor.Comum@teste');
    await confirmar.click();

    await expect.poll(() => backend.de('functions/v1/admin-contas').length).toBe(1);
    expect(backend.de('functions/v1/admin-contas')[0].corpo).toEqual({ acao: 'excluir', user_id: uuid(1) });
    await expect(page.getByRole('status').filter({ hasText: 'Usuário Gestor Comum excluído.' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'gestor.comum@teste' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Com acesso (2)' })).toBeVisible();
  });

  test('conta desativada e conta sem acesso também podem ser excluídas', async ({ page }) => {
    const backend = await instalarBackend(page, { administrador: true, contas: contas() });
    await page.goto('/admin');
    for (const [email, id] of [['consulta.cisp@teste', 2], ['sem.acesso@teste', 3]] as const) {
      await page.locator('tr', { hasText: email }).getByRole('button', { name: 'Excluir usuário' }).click();
      await page.getByLabel('Para confirmar, digite o e-mail da conta').fill(email);
      await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
      await expect.poll(() => backend.de('functions/v1/admin-contas').some((c) => (c.corpo as { user_id: string }).user_id === uuid(id))).toBe(true);
      await expect(page.locator('tr', { hasText: email })).toHaveCount(0);
    }
  });

  test('recusa do servidor aparece e a conta continua na lista', async ({ page }) => {
    const backend = await instalarBackend(page, { administrador: true, contas: contas() });
    backend.funcaoComErro('Não é possível excluir o último administrador ativo.');
    await page.goto('/admin');
    const linha = page.locator('tr', { hasText: 'outro.admin@teste' });
    await linha.getByRole('button', { name: 'Excluir usuário' }).click();
    await page.getByLabel('Para confirmar, digite o e-mail da conta').fill('outro.admin@teste');
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page.getByRole('alert')).toContainText('Não é possível excluir o último administrador ativo.');
    await expect(linha).toBeVisible();
  });
});
