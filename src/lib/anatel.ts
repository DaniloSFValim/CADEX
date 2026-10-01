import type { Empresa } from './empresas';

/**
 * Cruzamento com a Anatel (banda larga fixa em Niterói), a partir do
 * arquivo do município publicado pelo NETRANK RJ, que processa os dados
 * abertos da Anatel. Em produção chega por /anatel/niteroi.json, que o
 * Vercel repassa ao NETRANK (vercel.json): o navegador não fala com outro
 * domínio.
 *
 * Identidade pela raiz do CNPJ (8 primeiros dígitos), como no NETRANK:
 * filiais da mesma empresa contam juntas.
 */
export const FONTE_ANATEL = 'https://netranking-rj.labdados.org/municipios/niteroi/';

export type AtuacaoAnatel = 'OPERADORA' | 'PROVEDOR' | 'AMBOS' | 'INDEFINIDO';

export interface ProvedorAnatel {
  posicao: number;
  nome: string;
  cnpj: string;
  acessos: number;
  marketShare: number;
  grupoEconomico?: string;
  tipoAtuacao?: AtuacaoAnatel;
}

export interface MunicipioAnatel {
  nome: string;
  competencia: string;
  concentracao: { numeroProvedores: number; totalAcessos: number };
  ranking: ProvedorAnatel[];
}

export interface LinhaCruzamento {
  provedor: ProvedorAnatel;
  /** Empresa do CADEX com a mesma raiz de CNPJ, se houver. */
  empresa: Empresa | null;
  /**
   * Sem inscrição própria, mas outro CNPJ do mesmo grupo econômico (segundo
   * a Anatel) está inscrito: ex. Claro com dois CNPJs.
   */
  grupoInscrito: Empresa | null;
}

export interface Cruzamento {
  linhas: LinhaCruzamento[];
  /** Operadoras inscritas no CADEX sem acessos declarados em Niterói. */
  operadorasSemAcessos: Empresa[];
}

export const raizCnpj = (cnpj: string) => cnpj.replace(/\D/g, '').slice(0, 8);

export function cruzar(municipio: MunicipioAnatel, empresas: Empresa[]): Cruzamento {
  const porRaiz = new Map<string, Empresa>();
  for (const e of empresas) {
    const r = raizCnpj(e.cnpj);
    // Mais de uma inscrição com a mesma raiz: prefere a operadora.
    if (!porRaiz.has(r) || e.tipo === 'operadora') porRaiz.set(r, e);
  }
  // Grupo econômico com algum CNPJ inscrito. "OUTROS" é o rótulo da Anatel
  // para quem não pertence a grupo: não agrupa nada.
  const inscritoNoGrupo = new Map<string, Empresa>();
  for (const p of municipio.ranking) {
    const e = porRaiz.get(raizCnpj(p.cnpj));
    if (e && p.grupoEconomico && p.grupoEconomico !== 'OUTROS' && !inscritoNoGrupo.has(p.grupoEconomico)) {
      inscritoNoGrupo.set(p.grupoEconomico, e);
    }
  }
  const linhas = [...municipio.ranking]
    .sort((a, b) => b.acessos - a.acessos)
    .map((provedor) => {
      const empresa = porRaiz.get(raizCnpj(provedor.cnpj)) ?? null;
      const grupoInscrito = !empresa && provedor.grupoEconomico ? inscritoNoGrupo.get(provedor.grupoEconomico) ?? null : null;
      return { provedor, empresa, grupoInscrito };
    });
  const raizesAnatel = new Set(municipio.ranking.map((p) => raizCnpj(p.cnpj)));
  const operadorasSemAcessos = empresas
    .filter((e) => e.tipo === 'operadora' && !raizesAnatel.has(raizCnpj(e.cnpj)))
    .sort((a, b) => a.razao_social.localeCompare(b.razao_social, 'pt-BR'));
  return { linhas, operadorasSemAcessos };
}

export async function buscarNiteroiAnatel(): Promise<MunicipioAnatel> {
  const r = await fetch('/anatel/niteroi.json');
  if (!r.ok) throw new Error(`Não foi possível ler os dados da Anatel (HTTP ${r.status}).`);
  const d = (await r.json()) as MunicipioAnatel;
  if (!Array.isArray(d?.ranking)) throw new Error('Arquivo da Anatel em formato inesperado.');
  return d;
}

/** "2026-07" → "jul/2026". */
export function rotuloCompetencia(c: string): string {
  const [ano, mes] = c.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(mes) - 1] ?? mes}/${ano}`;
}
