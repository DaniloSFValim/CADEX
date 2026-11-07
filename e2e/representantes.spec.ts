import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { empresasPadrao, uuid } from './apoio/dados';

test.describe('acessos de empresas (portal das empresas)', () => {
  test('lista os representantes e desativa um acesso', async ({ page }) => {
    const [emp] = empresasPadrao();
    const backend = await instalarBackend(page, {
      administrador: true,
      empresas: empresasPadrao(),
      representantes: [{
        user_id: uuid(501), empresa_id: emp.id, papel: 'representante', ativo: true,
        nome: 'Maria Representante', email: 'maria@empresa.test', criado_em: '2026-10-01T10:00:00Z', desativado_em: null,
      }],
    });
    await page.goto('/admin');

    const card = page.getByRole('group', { name: /Acessos de empresas/ }).or(page.locator('section', { hasText: 'Acessos de empresas' })).first();
    await expect(card).toContainText('Maria Representante');
    await expect(card).toContainText('maria@empresa.test');
    await expect(card).toContainText(emp.razao_social);

    await card.getByRole('button', { name: 'Desativar' }).click();
    await expect.poll(() => backend.de('empresa_usuarios').filter((c) => c.metodo === 'PATCH').length).toBe(1);
    const patch = backend.de('empresa_usuarios').find((c) => c.metodo === 'PATCH')!;
    expect(patch.corpo).toMatchObject({ ativo: false });
    expect(patch.consulta.get('user_id')).toBe(`eq.${uuid(501)}`);
    await expect(page.getByRole('status').filter({ hasText: 'Acesso de Maria Representante desativado' })).toBeVisible();
  });

  test('cria um acesso pelo servidor e mostra a senha provisória uma vez', async ({ page }) => {
    const [emp] = empresasPadrao();
    const backend = await instalarBackend(page, { administrador: true, empresas: empresasPadrao(), representantes: [] });
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Novo acesso de empresa' }).click();
    await page.getByLabel(/^Empresa/).selectOption(emp.id);
    await page.getByLabel(/^Nome do representante/).fill('João Operador');
    await page.getByLabel(/^E-mail/).fill('joao@empresa.test');
    await page.getByRole('button', { name: 'Criar acesso' }).click();

    await expect.poll(() => backend.de('functions/v1/admin-contas').length).toBe(1);
    const chamada = backend.de('functions/v1/admin-contas')[0].corpo as Record<string, unknown>;
    expect(chamada).toMatchObject({
      acao: 'criar_representante', empresa_id: emp.id, nome: 'João Operador', email: 'joao@empresa.test', papel: 'representante',
    });
    expect(String(chamada.senha).length).toBeGreaterThanOrEqual(12);
    await expect(page.getByRole('status').filter({ hasText: 'Acesso criado para João Operador' })).toContainText(String(chamada.senha));
  });
});
