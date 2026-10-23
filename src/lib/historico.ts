import { origemPublica } from './licencas';
import type { ObraPublica } from './obras';

// ---------------------------------------------------------------------
// Histórico do acervo: perfil das licenças ao longo dos anos.
// Usa só o que a consulta pública já mostra. O ano é o do início previsto
// (o número da licença tem formatos diferentes e não serve de referência).
// Não mede duração nem taxa de conclusão: a conclusão de empresas é só
// registro cadastral.
// ---------------------------------------------------------------------

export interface AnoHistorico {
  ano: number;
  total: number;
  publico: number;
  empresa: number;
}

export interface ResumoHistorico {
  total: number;
  publico: number;
  empresa: number;
  /** Um item por ano do primeiro ao último com dado, sem pular anos vazios. */
  anos: AnoHistorico[];
  /** Média de licenças por ano, contando os anos vazios entre o primeiro e o último. */
  mediaPorAno: number;
  /** Tipos de obra, do mais frequente. Uma obra conta uma vez por tipo. */
  tipos: { codigo: string; total: number }[];
  /** Anos com dado, usados para decidir o aviso de amostra pequena. */
  anosComDado: number;
}

/** Abaixo deste número de anos com dado, o painel não mostra tendência. */
export const ANOS_MINIMOS_TENDENCIA = 3;

/** Ano do início previsto, ou nulo quando a licença não tem período. */
const anoDe = (o: ObraPublica): number | null =>
  o.inicio_previsto ? Number(o.inicio_previsto.slice(0, 4)) : null;

export function resumoHistorico(obras: ObraPublica[]): ResumoHistorico {
  const porAno = new Map<number, AnoHistorico>();
  const tipos = new Map<string, number>();
  let publico = 0;

  for (const o of obras) {
    const ano = anoDe(o);
    const ehPublico = origemPublica(o.origem);
    if (ehPublico) publico += 1;
    for (const t of new Set(o.tipos_obra)) tipos.set(t, (tipos.get(t) ?? 0) + 1);
    if (ano === null) continue;
    const linha = porAno.get(ano) ?? { ano, total: 0, publico: 0, empresa: 0 };
    linha.total += 1;
    if (ehPublico) linha.publico += 1; else linha.empresa += 1;
    porAno.set(ano, linha);
  }

  const anos = [...porAno.values()].sort((a, b) => a.ano - b.ano);
  const primeiro = anos[0]?.ano;
  const ultimo = anos[anos.length - 1]?.ano;
  const intervalo = primeiro === undefined || ultimo === undefined ? 0 : ultimo - primeiro + 1;
  const mediaPorAno = intervalo === 0 ? 0 : anos.reduce((s, a) => s + a.total, 0) / intervalo;

  return {
    total: obras.length,
    publico,
    empresa: obras.length - publico,
    anos,
    mediaPorAno,
    tipos: [...tipos.entries()]
      .map(([codigo, total]) => ({ codigo, total }))
      .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo)),
    anosComDado: anos.length,
  };
}

/** A série anual só ganha leitura de tendência com anos suficientes. */
export const temTendencia = (r: ResumoHistorico) => r.anosComDado >= ANOS_MINIMOS_TENDENCIA;
