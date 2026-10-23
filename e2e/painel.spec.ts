import { expect, test, type Page } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca } from './apoio/dados';

/**
 * Oito licenças com contagens conhecidas (hoje = dia 0):
 *   em execução: 2   aguardando início: 3   prazo encerrado: 1   concluída: 1   cancelada: 1
 *   começam em até 15 dias: 2 (dia +3 e +9)   terminam em até 15 dias: 1 (dia +5)
 *   contratantes: OpUm 6 licenças, Operadora Dois 2
 */
const cenario = () => ({
  licencas: [
    licenca({ inicio_previsto: dia(-10), fim_previsto: dia(20) }),
    licenca({ inicio_previsto: dia(-40), fim_previsto: dia(5), contratante_id: 'op2' }),
    licenca({ inicio_previsto: dia(3), fim_previsto: dia(40) }),
    licenca({ inicio_previsto: dia(9), fim_previsto: dia(60), contratante_id: 'op2' }),
    licenca({ inicio_previsto: dia(40), fim_previsto: dia(90) }),
    licenca({ inicio_previsto: dia(-90), fim_previsto: dia(-30) }),
    licenca({ inicio_previsto: dia(-70), fim_previsto: dia(-40), concluida_em: dia(-42), as_built_sei: 'D-1', as_built_data: dia(-41) }),
    licenca({ situacao: 'cancelada', inicio_previsto: null, fim_previsto: null }),
  ],
});

const indicador = (page: Page, rotulo: string) =>
  page.locator('section[aria-label="Indicadores"] button, section[aria-label="Indicadores"] > div > div').filter({ hasText: rotulo }).first();
const resumo = (page: Page) => page.locator('section[aria-label="Filtros"] [role=status]');
const bloco = (page: Page, titulo: string) => page.locator('section', { has: page.getByRole('heading', { name: titulo }) });

test.describe('painel gerencial', () => {
  test('mostra os números calculados sobre as licenças do banco', async ({ page }) => {
    await instalarBackend(page, cenario());
    await page.goto('/dashboard');

    await expect(indicador(page, 'Licenças registradas')).toHaveText(/Licenças registradas\s*8/);
    await expect(indicador(page, 'Aguardando início')).toHaveText(/Aguardando início\s*3/);
    await expect(indicador(page, 'Em execução')).toHaveText(/Em execução\s*2/);
    await expect(indicador(page, 'Concluídas')).toHaveText(/Concluídas\s*1/);
    await expect(indicador(page, 'Prazo encerrado')).toHaveText(/Prazo encerrado\s*1/);
    await expect(indicador(page, 'Começam em até 15 dias')).toHaveText(/Começam em até 15 dias\s*2/);
    await expect(indicador(page, 'Terminam em até 15 dias')).toHaveText(/Terminam em até 15 dias\s*1/);
    await expect(indicador(page, 'Contratantes')).toHaveText(/Contratantes\s*2/);
    await expect(resumo(page)).toHaveText(/8\s+licenças, sem filtro/);
    await expect(page.locator('section[aria-label="Registros"] tbody tr')).toHaveCount(8);
  });

  test('clicar num indicador filtra tudo, e "Limpar filtros" volta à visão geral', async ({ page }) => {
    await instalarBackend(page, cenario());
    await page.goto('/dashboard');

    await indicador(page, 'Aguardando início').click();
    await expect(resumo(page)).toContainText('3 de 8 licenças com estes filtros');
    await expect(page.locator('section[aria-label="Registros"] tbody tr')).toHaveCount(3);
    await expect(indicador(page, 'Licenças registradas')).toHaveText(/Licenças registradas\s*3/);

    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(resumo(page)).toHaveText(/8\s+licenças, sem filtro/);
  });

  test('clicar numa barra de contratante filtra, e os filtros se combinam', async ({ page }) => {
    await instalarBackend(page, cenario());
    await page.goto('/dashboard');

    await bloco(page, 'Por contratante').getByRole('button', { name: /OpUm/ }).click();
    await expect(resumo(page)).toContainText('6 de 8 licenças com estes filtros');

    await indicador(page, 'Em execução').click();
    await expect(resumo(page)).toContainText('1 de 8 licenças com estes filtros');
  });

  test('o filtro de período mostra as licenças cujo período cruza o intervalo', async ({ page }) => {
    await instalarBackend(page, cenario());
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Próximos 90 dias' }).click();
    // As cinco em execução ou programadas; fora ficam a vencida, a concluída e a cancelada.
    await expect(resumo(page)).toContainText('5 de 8 licenças com estes filtros');
  });

  test('sem licenças, mostra o estado vazio em vez de números zerados', async ({ page }) => {
    await instalarBackend(page, { licencas: [] });
    await page.goto('/dashboard');
    await expect(page.getByText('Nenhuma licença registrada ainda.')).toBeVisible();
    await expect(page.locator('section[aria-label="Indicadores"]')).toHaveCount(0);
  });

  test('erro ao ler o banco mostra a mensagem e deixa tentar de novo', async ({ page }) => {
    const backend = await instalarBackend(page, cenario());
    backend.falhar('licencas');
    await page.goto('/dashboard');
    await expect(page.getByRole('alert')).toContainText('Falha simulada do servidor.');

    backend.restaurar('licencas');
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(indicador(page, 'Licenças registradas')).toHaveText(/Licenças registradas\s*8/);
  });

  test('"Atualizar" lê o banco de novo e mostra o que mudou', async ({ page }) => {
    const backend = await instalarBackend(page, cenario());
    await page.goto('/dashboard');
    await expect(indicador(page, 'Licenças registradas')).toHaveText(/Licenças registradas\s*8/);
    const antes = backend.de('licencas').length;

    backend.estado.licencas.push(licenca({ inicio_previsto: dia(1), fim_previsto: dia(10) }));
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(indicador(page, 'Licenças registradas')).toHaveText(/Licenças registradas\s*9/);
    expect(backend.de('licencas').length).toBeGreaterThan(antes);
  });

  test('CISP vê a visão geral, mas não a aba das pendências', async ({ page }) => {
    await instalarBackend(page, { ...cenario(), perfil: 'cisp' });
    await page.goto('/dashboard');
    await expect(indicador(page, 'Licenças registradas')).toHaveText(/Licenças registradas\s*8/);
    await expect(page.getByRole('link', { name: 'Pendências' })).toHaveCount(0);
  });
});
