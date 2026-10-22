import { expect, test, type Page } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { dia, licenca } from './apoio/dados';

/** Quantos trechos o mapa recebeu (atributo do próprio componente). */
const noMapa = (page: Page) => page.locator('[data-trechos]');
const lista = (page: Page) => page.locator('section[aria-label="Lista das obras e serviços licenciados"] details li');
/** A lista mostra só as vigentes por padrão: abre as encerradas e concluídas antes de contar tudo. */
const mostrarEncerradas = async (page: Page) => {
  const botao = page.getByRole('button', { name: /^Todas \(/ });
  await expect(botao).toBeVisible();
  await botao.click();
};

const orgao = (id: string, nome: string, natureza: 'administracao_direta' | 'autarquia') =>
  ({ id, nome, sigla: nome.slice(0, 4).toUpperCase(), esfera: 'municipal' as const, cnpj: null, setores: [], natureza, criado_em: '2026-01-01', atualizado_em: '2026-01-01' });

test.describe('mapa de consulta', () => {
  test('mostra no mapa e na lista as licenças do banco, com tipo e origem', async ({ page }) => {
    await instalarBackend(page, {
      orgaos: [orgao('pref', 'Secretaria de Obras', 'administracao_direta')],
      licencas: [
        licenca({ escopo: 'Rede óptica' }),
        licenca({ tipo_intervencao: 'servico', escopo: 'Manutenção de poste' }),
        licenca({ origem_intervencao: 'municipio', orgao_contratante_id: 'pref', contratante_id: null, escopo: 'Pavimentação' }),
      ],
    });
    await page.goto('/consulta/obras');
    await mostrarEncerradas(page);
    await expect(noMapa(page)).toHaveAttribute('data-trechos', '3');
    await expect(lista(page).filter({ hasText: 'Serviço' })).toHaveCount(1);
    await expect(lista(page).filter({ hasText: 'pública · prefeitura ou órgão municipal' })).toHaveCount(1);
    // Contratante público aparece pelo nome do órgão, não vazio.
    await expect(lista(page).filter({ hasText: 'para SECR' })).toHaveCount(1);
  });

  test('mostra todas as licenças, sem filtro, e o mapa recebe todas', async ({ page }) => {
    await instalarBackend(page, {
      licencas: [
        licenca({ inicio_previsto: dia(-5), fim_previsto: dia(10) }),
        licenca({ inicio_previsto: dia(-90), fim_previsto: dia(-60) }),
        licenca({ inicio_previsto: dia(-90), fim_previsto: dia(-60), concluida_em: dia(-62) }),
      ],
    });
    await page.goto('/consulta/obras');
    await mostrarEncerradas(page);
    await expect(lista(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Todas (3)' })).toBeVisible();
    await expect(noMapa(page)).toHaveAttribute('data-trechos', '3');
  });

  test('licença cancelada sem data de decisão nem período não derruba a página', async ({ page }) => {
    // Reproduz o defeito: o filtro de ano lia `decisao_data.startsWith` e a página inteira ficava em branco.
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await instalarBackend(page, {
      licencas: [licenca({}), licenca({ situacao: 'cancelada', decisao_data: null, inicio_previsto: null, fim_previsto: null })],
    });
    await page.goto('/consulta/obras');
    await mostrarEncerradas(page);
    await expect(lista(page)).toHaveCount(2);
    await expect(page.getByText('Sem período informado')).toBeVisible();
    expect(erros).toEqual([]);
  });

  test('licença sem localização aparece na lista, identificada, e fora do mapa', async ({ page }) => {
    await instalarBackend(page, { licencas: [licenca({}), licenca({ licenca_trechos: [] })] });
    await page.goto('/consulta/obras');
    await expect(lista(page)).toHaveCount(2);
    await expect(page.getByText('Sem localização', { exact: true })).toHaveCount(1);
    await expect(noMapa(page)).toHaveAttribute('data-trechos', '1');
  });

  test('cadastrar obra e serviço com localização faz os dois aparecerem no mapa; alterar a localização e excluir também refletem', async ({ page }) => {
    const backend = await instalarBackend(page);
    for (const tipo of ['obra', 'servico'] as const) {
      await page.goto('/obras/nova');
      await page.locator('label:has(> span:text-matches("^Tipo de intervenção[*]?$")) select').selectOption(tipo);
      await page.locator('label:has(> span:text-matches("^Contratante[*]?$")) select').selectOption('op1');
      await page.locator('label:has(> span:text-matches("^Executora[*]?$")) select').selectOption('ter1');
      await page.locator('label:has(> span:text-matches("^Nº do processo[*]?$")) input').fill(`NIT-050120/00090${tipo === 'obra' ? 1 : 2}/2026`);
      await page.locator('label:has-text("Abertura de vala") input').check();
      await page.locator('label:has(> span:text-matches("^Escopo d[oa] (obra|serviço)[*]?$")) textarea').fill(`Teste ${tipo}`);
      await page.locator('label:has(> span:text-matches("^Data da decisão[*]?$")) input').fill(dia(-1));
      await page.locator('label:has(> span:text-matches("^Nº da licença[*]?$")) input').fill(`90${tipo === 'obra' ? 1 : 2}/2026`);
      await page.locator('label:has(> span:text-matches("^Fim da obra ou serviço[*]?$")) input').fill(dia(30));
      await page.locator('label:has(> span:text-matches("^Logradouro[*]?$")) input').fill('Rua Mem de Sá');
      await page.getByPlaceholder('-22.895000, -43.123000').first().fill('-22.905, -43.110');
      await page.getByRole('button', { name: 'Registrar licença' }).click();
      await expect.poll(() => backend.de('rpc/salvar_licenca').length).toBe(tipo === 'obra' ? 1 : 2);
    }
    await page.goto('/consulta/obras');
    await expect(lista(page)).toHaveCount(2);
    await expect(noMapa(page)).toHaveAttribute('data-trechos', '2');

    // O que o banco devolve a mais (a licença nova) chega ao mapa ao recarregar; a troca de coordenada
    // é conferida no teste do banco (obras_publicas e obras_geojson leem o trecho gravado).
    // Excluída (o banco deixa de devolvê-la): sai da lista e do mapa.
    backend.estado.licencas = backend.estado.licencas.slice(1);
    await page.reload();
    await expect(lista(page)).toHaveCount(1);
    await expect(noMapa(page)).toHaveAttribute('data-trechos', '1');
  });
});

test.describe('faixa do tempo e ficha da obra', () => {
  const faixa = (page: Page) => page.locator('section[aria-label="Faixa do tempo das obras"]');
  const ficha = (page: Page) => page.locator('article[aria-label="Ficha da obra selecionada"]');

  test('clicar numa barra da faixa abre a ficha da obra; "Fechar" esconde', async ({ page }) => {
    await instalarBackend(page, {
      licencas: [licenca({ escopo: 'Rede óptica' }), licenca({ tipo_intervencao: 'servico', escopo: 'Manutenção de poste' })],
    });
    await page.goto('/consulta/obras');
    await expect(faixa(page).getByRole('button')).toHaveCount(2);
    await expect(ficha(page)).toHaveCount(0);

    await faixa(page).getByRole('button').first().click();
    await expect(ficha(page)).toBeVisible();
    await expect(ficha(page)).toContainText('Rede óptica');
    await expect(ficha(page)).toContainText('Executora');
    await expect(faixa(page).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');

    await ficha(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(ficha(page)).toHaveCount(0);
  });

  test('sem obra com período no ano, a faixa diz isso em vez de ficar vazia', async ({ page }) => {
    await instalarBackend(page, {
      licencas: [licenca({ inicio_previsto: '2019-01-01', fim_previsto: '2019-02-01', decisao_data: '2018-12-20' })],
    });
    await page.goto('/consulta/obras');
    await expect(faixa(page)).toContainText('Nenhuma obra com período neste ano');
    await expect(faixa(page).getByRole('button')).toHaveCount(0);
  });
});
