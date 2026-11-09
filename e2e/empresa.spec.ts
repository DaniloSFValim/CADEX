import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';

test.describe('cadastro da empresa: executa obras por conta própria', () => {
  test('a titular marca a opção e o cadastro grava a marca', async ({ page }) => {
    const backend = await instalarBackend(page);
    await page.goto('/empresas/op3');
    await page.getByRole('button', { name: 'Editar dados' }).click();
    const caixa = page.getByLabel('Esta empresa também executa obras ou serviços por conta própria.');
    await expect(caixa).not.toBeChecked();
    await caixa.check();
    await page.getByRole('button', { name: /^Salvar/ }).first().click();

    await expect.poll(() => backend.de('empresas', 'PATCH').length).toBe(1);
    const patch = backend.de('empresas', 'PATCH')[0];
    expect(patch.consulta.get('id')).toBe('eq.op3');
    expect(patch.corpo).toMatchObject({ executa_obras: true });
  });

  test('terceirizada não tem a opção', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/empresas/ter1');
    await page.getByRole('button', { name: 'Editar dados' }).click();
    await expect(page.getByLabel('Esta empresa também executa obras ou serviços por conta própria.')).toHaveCount(0);
  });

  test('no cadastro novo, trocar para terceirizada desmarca e esconde a opção', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/empresas/nova');
    const caixa = page.getByLabel('Esta empresa também executa obras ou serviços por conta própria.');
    await caixa.check();
    await page.locator('#tipo').selectOption('terceirizada');
    await expect(caixa).toHaveCount(0);
  });
});

test('telefone da empresa é formatado enquanto se digita', async ({ page }) => {
  await instalarBackend(page);
  await page.goto('/empresas/op3');
  await page.getByRole('button', { name: 'Editar dados' }).click();
  const campo = page.locator('#telefone');
  await campo.fill('21999998888');
  await expect(campo).toHaveValue('(21) 99999-8888');
});

test.describe('comunicação de serviço programado ao CISP', () => {
  test('o aviso do 153 aparece em destaque e o número de cadastro, na página da empresa', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/empresas/op3');
    const aviso = page.getByRole('note');
    // Emergência: ligação obrigatória ao 153 antes de agir; registro no CADEX depois do fato.
    await expect(aviso).toContainText('Emergência: ligar para o 153 (CISP) antes de agir');
    await expect(aviso).toContainText('Ligar para o 153');
    // Serviço programado: registro no CADEX antes do início; sem ligação ao CISP.
    await expect(aviso).toContainText('Serviço programado: registrar no CADEX antes do início');
    await expect(aviso).toContainText('Não é preciso informar o CISP');
    await expect(aviso).toContainText('Só empresas cadastradas no CADEX podem fazer essas comunicações');
    await expect(aviso).toContainText('número de cadastro');
    await expect(aviso).toContainText('placas dos veículos');
  });

  test('servidor consulta as comunicações da empresa, mas não registra nem vê o cadastro em lote', async ({ page }) => {
    await instalarBackend(page);
    await page.goto('/empresas/op3');
    await expect(page.getByRole('heading', { name: 'Comunicações registradas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova comunicação' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Cadastro em lote' })).toHaveCount(0);
  });
});
