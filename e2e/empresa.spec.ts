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
    await expect(aviso).toContainText('153');
    await expect(aviso).toContainText('Só empresas cadastradas no CADEX podem fazer essa comunicação');
    await expect(aviso).toContainText('número de cadastro');
    await expect(aviso).toContainText('placas dos veículos');
  });

  test('placa inválida é barrada antes de ir ao servidor; comunicação válida vai com a placa normalizada', async ({ page }) => {
    const backend = await instalarBackend(page);
    await page.goto('/empresas/op3');
    await page.getByRole('button', { name: 'Nova comunicação' }).click();
    const campo = (nome: string) => page.getByLabel(new RegExp(`^${nome}`));
    const amanha = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const depois = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

    await campo('Responsável').fill('Fulano de Tal');
    await campo('Placas dos veículos').fill('XYZ');
    await campo('Local do serviço').fill('Rua A, 10');
    await campo('Descrição do serviço').fill('Manutenção de rede');
    await campo('Início previsto').fill(amanha);
    await campo('Fim previsto').fill(depois);
    await page.getByRole('button', { name: 'Registrar comunicação' }).click();
    await expect(page.getByRole('alert')).toContainText('Placa inválida: XYZ');
    expect(backend.de('comunicacoes_servico', 'POST')).toHaveLength(0);

    await campo('Placas dos veículos').fill('abc-1234, abc1d23');
    await page.getByRole('button', { name: 'Registrar comunicação' }).click();
    await expect.poll(() => backend.de('comunicacoes_servico', 'POST').length).toBe(1);
    const corpo = backend.de('comunicacoes_servico', 'POST')[0].corpo as Record<string, unknown>;
    expect(corpo).toMatchObject({ empresa_id: 'op3', responsavel: 'Fulano de Tal', placas: ['ABC1234', 'ABC1D23'], tipo: 'programado' });
    await expect(page.getByRole('status')).toContainText('Comunicação registrada para Fulano de Tal');
  });
});
