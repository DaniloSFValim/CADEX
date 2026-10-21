import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instalarBackend, type Cenario } from './apoio/backend';
import { empresasPadrao } from './apoio/dados';

// Varredura automática com axe-core (WCAG 2.0 e 2.1, níveis A e AA) nas telas
// do sistema. Pega contraste, rótulos, landmarks e ARIA que a revisão manual
// deixa passar. Não substitui o teste com leitor de tela.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function varrer(page: Page) {
  // Espera a tela montar: a região principal aparece depois do carregamento.
  await expect(page.locator('main#conteudo')).toBeVisible();
  const resultado = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return resultado.violations.map((v) => ({
    id: v.id,
    impacto: v.impact,
    ajuda: v.help,
    nos: v.nodes.map((n) => n.target.join(' ')),
  }));
}

/** Telas públicas: sem sessão. */
const PUBLICAS: { nome: string; caminho: string; cenario?: Partial<Cenario> }[] = [
  { nome: 'consulta de obras', caminho: '/consulta/obras', cenario: { licencas: [] } },
  { nome: 'consulta (empresas)', caminho: '/consulta' },
  { nome: 'entrada na área restrita', caminho: '/entrar' },
];

/** Telas internas do gestor (perfil SECONSER, sem administração). */
const GESTOR: { nome: string; caminho: string }[] = [
  { nome: 'painel', caminho: '/dashboard' },
  { nome: 'pendências', caminho: '/dashboard/pendencias' },
  { nome: 'empresas', caminho: '/empresas' },
  { nome: 'nova empresa', caminho: '/empresas/nova' },
  { nome: 'obras e serviços', caminho: '/obras' },
  { nome: 'nova licença', caminho: '/obras/nova' },
  { nome: 'obras sem licença', caminho: '/obras/sem-licenca' },
  { nome: 'minha conta', caminho: '/minha-conta' },
];

/** Telas da administração: exigem o flag de administrador. */
const ADMIN: { nome: string; caminho: string }[] = [
  { nome: 'administração: empresas', caminho: '/admin/empresas' },
  { nome: 'administração: licenças', caminho: '/admin/licencas' },
  { nome: 'administração: tipos', caminho: '/admin/tipos' },
  { nome: 'órgãos', caminho: '/orgaos' },
  { nome: 'administração: configurações', caminho: '/admin/configuracoes' },
  { nome: 'administração: auditoria', caminho: '/admin/auditoria' },
];

test.describe('acessibilidade automatizada (axe, WCAG AA): públicas', () => {
  for (const tela of PUBLICAS) {
    test(tela.nome, async ({ page }) => {
      await instalarBackend(page, tela.cenario ?? {});
      await page.goto(tela.caminho);
      expect(await varrer(page)).toEqual([]);
    });
  }
});

test.describe('acessibilidade automatizada (axe, WCAG AA): área restrita', () => {
  for (const tela of GESTOR) {
    test(tela.nome, async ({ page }) => {
      await instalarBackend(page, { perfil: 'gestor' });
      await page.goto(tela.caminho);
      expect(await varrer(page)).toEqual([]);
    });
  }

  for (const tela of ADMIN) {
    test(tela.nome, async ({ page }) => {
      await instalarBackend(page, { administrador: true, perfil: 'gestor' });
      await page.goto(tela.caminho);
      expect(await varrer(page)).toEqual([]);
    });
  }
});

test.describe('acessibilidade automatizada (axe, WCAG AA): documentos oficiais', () => {
  test('documentos oficiais da empresa (gestor)', async ({ page }) => {
    await instalarBackend(page, { perfil: 'gestor', empresas: empresasPadrao() });
    await page.goto(`/empresas/${empresasPadrao()[0].id}/documentos`);
    await expect(page.getByRole('tab', { name: 'Auto de Infração' })).toBeVisible();
    expect(await varrer(page)).toEqual([]);
  });
});
