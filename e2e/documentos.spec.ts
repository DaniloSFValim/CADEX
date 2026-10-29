import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { empresasPadrao } from './apoio/dados';

const empresa = () => empresasPadrao()[0];

test.describe('documentos oficiais', () => {
  test('a emissão só libera depois de conferir e mostra o número sequencial', async ({ page }) => {
    const backend = await instalarBackend(page, { perfil: 'gestor', empresas: empresasPadrao() });
    await page.goto(`/empresas/${empresa().id}/documentos`);

    const emitir = page.getByRole('button', { name: 'Emitir auto de notificação' });
    await expect(emitir).toBeDisabled();

    await page.getByLabel('Local da infração *').fill('Rua Exemplo, 50');
    await page.getByLabel('Data *').fill('2026-10-19');
    await page.getByLabel('Hora *').fill('09:30');
    await page.getByLabel('Processo *').fill('0000000000/2026');
    await page.getByLabel('Fatos verificados *').fill('Intervenção sem licença válida.');
    await page.getByLabel('Providência exigida *').fill('Regularizar a intervenção.');
    await page.getByLabel('Prazo para cumprimento *').fill('15 dias');
    await page.getByLabel('Recebimento *').selectOption('Entregue ao autuado');
    await page.getByLabel('Fiscal autuante: nome *').fill('Fiscal Exemplo');
    await page.getByLabel('Fiscal autuante: matrícula *').fill('0000000-0');
    await page.getByLabel(/Conferi os dados/).check();
    await expect(emitir).toBeEnabled();
    await emitir.click();

    await expect(page.getByRole('status')).toContainText('documento nº NOT-001/2026 - SFSC');
    await expect(backend.chamadas.some((c) => c.caminho === 'rpc/emitir_documento')).toBe(true);
    const enviado = backend.chamadas.find((c) => c.caminho === 'rpc/emitir_documento')!.corpo as {
      p_tipo: string; p_dados: { autuado: { razao_social: string } } };
    expect(enviado.p_tipo).toBe('notificacao');
    expect(enviado.p_dados.autuado.razao_social).toBe(empresa().razao_social);
  });

  test('o auto de infração recusa valor zero antes de emitir', async ({ page }) => {
    await instalarBackend(page, { perfil: 'gestor', empresas: empresasPadrao() });
    await page.goto(`/empresas/${empresa().id}/documentos`);
    await page.getByRole('tab', { name: 'Auto de Infração' }).click();

    await page.getByLabel('Local da infração *').fill('Rua Exemplo, 50');
    await page.getByLabel('Data *').fill('2026-10-19');
    await page.getByLabel('Hora *').fill('09:30');
    await page.getByLabel('Processo *').fill('0000000000/2026');
    await page.getByLabel('Descrição da(s) infração(ões) *').fill('Intervenção sem licença.');
    await page.getByLabel('Infringência *').fill('Art. X');
    await page.getByLabel('Sanção *').fill('Anexo Único');
    await page.getByLabel('Valor da multa (R$) *').fill('0');
    await page.getByLabel('Prazo para pagamento ou impugnação *').fill('30 dias');
    await page.getByLabel('Recebimento *').selectOption('Testemunhas');
    await page.getByLabel('Fiscal autuante: nome *').fill('Fiscal Exemplo');
    await page.getByLabel('Fiscal autuante: matrícula *').fill('0000000-0');
    await page.getByLabel(/Conferi os dados/).check();
    await page.getByRole('button', { name: 'Emitir auto de infração' }).click();

    await expect(page.getByRole('alert')).toContainText('Valor da multa (R$): informe um valor maior que zero.');
  });
});
