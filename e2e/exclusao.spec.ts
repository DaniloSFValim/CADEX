import { expect, test, type Page } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca, uuid } from './apoio/dados';

const lista = (page: Page) => page.locator('section[aria-live="polite"] ul > li');

const cenario = () => ({
  administrador: true,
  licencas: [
    licenca({ id: uuid(501), numero: '501/2026', processo_sei: 'NIT-050120/000501/2026', escopo: 'Lançada por engano' }),
    licenca({ id: uuid(502), numero: '502/2026', processo_sei: 'NIT-050120/000502/2026', escopo: 'Correta' }),
  ],
});

test.describe('exclusão de licenças', () => {
  test('quem não é administrador não vê as ações de exclusão', async ({ page }) => {
    await instalarBackend(page, { ...cenario(), administrador: false });
    await page.goto(`/obras/${uuid(501)}`);
    await expect(page.getByRole('heading', { name: 'Licença 501/2026' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excluir licença' })).toHaveCount(0);
  });

  test('o administrador confere os dados, cancela, confirma, e a licença sai das listas, do painel e do mapa', async ({ page }) => {
    const backend = await instalarBackend(page, cenario());
    await page.goto('/admin/licencas');
    await page.getByLabel('Buscar licença').fill('501/2026');
    await page.getByRole('button', { name: 'Excluir' }).click();

    // O resumo identifica o registro antes de excluir.
    const painel = page.getByRole('group', { name: 'Confirmar exclusão da licença' });
    await expect(painel).toContainText('501/2026');
    await expect(painel).toContainText('NIT-050120/000501/2026');
    await expect(painel).toContainText('Contratante');
    await expect(painel).toContainText('Executora');
    await expect(painel).toContainText('Empresas, órgãos e o histórico de alterações não são apagados');

    // Cancelar não envia nada.
    await painel.getByRole('button', { name: 'Cancelar' }).click();
    expect(backend.de('rpc/admin_excluir_licenca')).toHaveLength(0);

    await page.getByRole('button', { name: 'Excluir' }).click();
    await page.getByLabel('Motivo (opcional)').fill('Processo errado');
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect.poll(() => backend.de('rpc/admin_excluir_licenca').length).toBe(1);
    expect(backend.de('rpc/admin_excluir_licenca')[0].corpo).toEqual({ p_id: uuid(501), p_motivo: 'Processo errado' });
    await expect(page.getByRole('status').filter({ hasText: 'Licença 501/2026 enviada para a lixeira.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lixeira (1)' })).toBeVisible();

    // Fora da lista de obras, do painel e do mapa de consulta.
    await page.goto('/obras');
    await expect(page.getByRole('link', { name: '502/2026', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '501/2026', exact: true })).toHaveCount(0);
    await expect(page.getByText('NIT-050120/000501/2026')).toHaveCount(0);
    await page.goto('/dashboard');
    await expect(page.locator('section[aria-label="Indicadores"] button, section[aria-label="Indicadores"] > div > div').filter({ hasText: 'Licenças registradas' }).first())
      .toHaveText(/Licenças registradas\s*1/);
    await page.goto('/consulta/obras');
    await expect(lista(page)).toHaveCount(1);
    await expect(page.locator('[data-trechos]')).toHaveAttribute('data-trechos', '1');
  });

  test('a lixeira restaura, e apagar de vez pede confirmação e remove', async ({ page }) => {
    const backend = await instalarBackend(page, cenario());
    await page.goto('/admin/licencas');
    await page.getByLabel('Buscar licença').fill('501/2026');
    await page.getByRole('button', { name: 'Excluir' }).click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page.getByRole('heading', { name: 'Lixeira (1)' })).toBeVisible();

    const item = page.locator('li', { hasText: 'Excluída' });
    await item.getByRole('button', { name: 'Restaurar' }).click();
    await expect(page.getByRole('heading', { name: 'Lixeira (0)' })).toBeVisible();
    expect(backend.de('rpc/admin_restaurar_licenca')[0].corpo).toEqual({ p_id: uuid(501) });
    await expect(page.getByText('Licença 501/2026 restaurada.')).toBeVisible();

    // De novo para a lixeira, e apagar de vez.
    await page.getByLabel('Buscar licença').fill('501/2026');
    await page.getByRole('button', { name: 'Excluir' }).click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page.getByRole('heading', { name: 'Lixeira (1)' })).toBeVisible();
    await page.locator('li', { hasText: 'Excluída' }).getByRole('button', { name: 'Apagar de vez' }).click();
    const conf = page.getByRole('group', { name: 'Confirmar exclusão definitiva' });
    await expect(conf).toContainText('Não dá para desfazer');
    await expect(conf).toContainText('não são apagados');
    expect(backend.de('rpc/admin_excluir_licenca_definitivamente')).toHaveLength(0);
    await conf.getByRole('button', { name: 'Apagar definitivamente' }).click();
    await expect.poll(() => backend.de('rpc/admin_excluir_licenca_definitivamente').length).toBe(1);
    await expect(page.getByRole('heading', { name: 'Lixeira (0)' })).toBeVisible();
    await expect(page.getByText('apagada definitivamente (1 trecho)')).toBeVisible();
    // As empresas continuam no cadastro.
    expect(backend.estado.empresas.length).toBeGreaterThan(0);
  });

  test('pela página da licença: excluir leva à lixeira, e a licença excluída abre só para leitura', async ({ page }) => {
    const backend = await instalarBackend(page, cenario());
    await page.goto(`/obras/${uuid(501)}`);
    await page.getByRole('button', { name: 'Excluir licença' }).click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page).toHaveURL(/\/admin\/licencas$/);
    await expect(page.getByText('Licença 501/2026 enviada para a lixeira.')).toBeVisible();

    await page.goto(`/obras/${uuid(501)}`);
    await expect(page.getByText('Esta licença está na lixeira')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excluir licença' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Salvar|Registrar licença/ })).toHaveCount(0);
    expect(backend.de('rpc/salvar_licenca')).toHaveLength(0);
  });
});
