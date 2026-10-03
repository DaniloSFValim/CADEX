import { nomeEmpresa, situacaoEfetiva, type Empresa } from './empresas';

/**
 * Triagem de risco do Painel do gestor.
 *
 * Reúne, por empresa, tudo que exige ação — em vez de espalhar os sinais
 * por várias listas. Não há "nota" opaca: cada empresa recebe a faixa do
 * seu pior motivo e a lista dos motivos, cada um com o prazo em dias. As
 * três faixas correspondem às três cores da identidade (ruim/alerta/neutro).
 *
 * As faixas, do mais urgente ao menos:
 *   crítico     empresa habilitada ou em obra, porém fora de conformidade:
 *               inscrição vencida, saneamento no fim do prazo (art. 8º),
 *               licença com prazo de cronograma encerrado.
 *   atenção     prazo apertando, ainda dentro dele: inscrição a vencer,
 *               obra concluída sem As Built (art. 26).
 *   acompanhar  atraso interno da SECONSER: análise parada (art. 7º). A
 *               empresa está esperando a decisão, não em falta.
 */
export type NivelRisco = 'critico' | 'atencao' | 'acompanhar';

export const NIVEL_LABEL: Record<NivelRisco, string> = {
  critico: 'Crítico',
  atencao: 'Atenção',
  acompanhar: 'Acompanhar',
};

/** Faixa → tom do Badge (ui.tsx). */
export const NIVEL_TOM: Record<NivelRisco, 'ruim' | 'alerta' | 'neutro'> = {
  critico: 'ruim',
  atencao: 'alerta',
  acompanhar: 'neutro',
};

const PESO: Record<NivelRisco, number> = { critico: 3, atencao: 2, acompanhar: 1 };

export interface MotivoRisco {
  nivel: NivelRisco;
  texto: string;
  /** Urgência dentro da faixa (maior = mais urgente); só para ordenar. */
  urgencia: number;
}

export interface EmpresaEmRisco {
  id: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  tipo: string;
  /** Faixa do pior motivo. */
  nivel: NivelRisco;
  motivos: MotivoRisco[];
}

/** Sinais já calculados pelas RPCs do dashboard e por pendenciasLicencas. */
export interface SinaisTriagem {
  /** Inscrições APTA a vencer em até 30 dias (dashboard_inscricoes_vencimento). */
  inscricoesVencendo: { id: string; dias_restantes: number }[];
  /** Saneamentos a vencer em até 7 dias (dashboard_saneamentos_vencimento). */
  saneamentos: { id: string; dias_restantes: number }[];
  /** Análises paradas há mais de 15 dias (dashboard_analises_pendentes). */
  analises: { id: string; dias_pendentes: number }[];
  /** Licenças com prazo de cronograma encerrado (pendenciasLicencas). */
  prazoEncerrado: { executora_id: string | null; numero: string | null; dias: number }[];
  /** Obras concluídas sem As Built (pendenciasLicencas). */
  semAsBuilt: { executora_id: string | null; numero: string | null; dias: number }[];
}

const dia = (n: number) => (n === 1 ? 'dia' : 'dias');

/**
 * Monta a lista de empresas em risco, ordenada por urgência: faixa, depois
 * número de motivos, depois o motivo mais urgente, depois razão social.
 * Empresas sem motivo não entram. Sinais sem empresa cadastrada (executora
 * de licença anterior à Resolução, sem `executora_id`) são ignorados aqui.
 */
export function triagemRisco(empresas: Empresa[], sinais: SinaisTriagem, hoje: string): EmpresaEmRisco[] {
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const risco = new Map<string, EmpresaEmRisco>();

  const registrar = (id: string | null, motivo: MotivoRisco) => {
    if (!id) return;
    const e = porId.get(id);
    if (!e) return;
    let r = risco.get(id);
    if (!r) {
      r = {
        id: e.id, nome: nomeEmpresa(e), razaoSocial: e.razao_social, cnpj: e.cnpj,
        tipo: e.tipo, nivel: motivo.nivel, motivos: [],
      };
      risco.set(id, r);
    }
    r.motivos.push(motivo);
    if (PESO[motivo.nivel] > PESO[r.nivel]) r.nivel = motivo.nivel;
  };

  // Crítico: inscrição vencida (habilitada, porém sem validade).
  for (const e of empresas) {
    if (situacaoEfetiva(e, hoje) === 'vencida' && e.validade_ate) {
      const d = diasDecorridos(e.validade_ate, hoje);
      registrar(e.id, { nivel: 'critico', urgencia: d, texto: `Inscrição vencida há ${d} ${dia(d)}` });
    }
  }
  // Crítico: saneamento no fim do prazo (art. 8º).
  for (const s of sinais.saneamentos) {
    registrar(s.id, {
      nivel: 'critico', urgencia: 100 - s.dias_restantes,
      texto: `Saneamento acaba em ${s.dias_restantes} ${dia(s.dias_restantes)}`,
    });
  }
  // Crítico: licença com prazo de cronograma encerrado.
  for (const l of sinais.prazoEncerrado) {
    registrar(l.executora_id, {
      nivel: 'critico', urgencia: l.dias,
      texto: `Licença ${l.numero ?? 'sem número'} com prazo encerrado há ${l.dias} ${dia(l.dias)}`,
    });
  }
  // Atenção: inscrição a vencer em até 30 dias.
  for (const i of sinais.inscricoesVencendo) {
    registrar(i.id, {
      nivel: 'atencao', urgencia: 100 - i.dias_restantes,
      texto: `Inscrição vence em ${i.dias_restantes} ${dia(i.dias_restantes)}`,
    });
  }
  // Atenção: obra concluída sem As Built (art. 26).
  for (const l of sinais.semAsBuilt) {
    registrar(l.executora_id, {
      nivel: 'atencao', urgencia: l.dias,
      texto: `Licença ${l.numero ?? 'sem número'} sem As Built há ${l.dias} ${dia(l.dias)}`,
    });
  }
  // Acompanhar: análise parada (atraso da SECONSER, não falta da empresa).
  for (const a of sinais.analises) {
    registrar(a.id, {
      nivel: 'acompanhar', urgencia: a.dias_pendentes,
      texto: `Análise parada há ${a.dias_pendentes} ${dia(a.dias_pendentes)}`,
    });
  }

  const maxUrgencia = (r: EmpresaEmRisco) =>
    Math.max(...r.motivos.filter((m) => m.nivel === r.nivel).map((m) => m.urgencia));

  return [...risco.values()]
    .map((r) => ({
      ...r,
      // Motivos do pior para o mais brando, e por urgência dentro da faixa.
      motivos: [...r.motivos].sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || b.urgencia - a.urgencia),
    }))
    .sort((a, b) =>
      PESO[b.nivel] - PESO[a.nivel] ||
      b.motivos.length - a.motivos.length ||
      maxUrgencia(b) - maxUrgencia(a) ||
      a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR'));
}

/** Dias de `inicio` (YYYY-MM-DD) até `hoje`, como texto, sem fuso. */
function diasDecorridos(inicio: string, hoje: string): number {
  const ms = Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}
