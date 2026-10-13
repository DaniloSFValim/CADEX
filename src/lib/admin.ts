import { podeAtuar, situacaoEfetiva, type Empresa } from './empresas';
import { estadoLicenca, type LicencaComTrechos } from './licencas';

// ---------------------------------------------------------------------
// Regras do painel administrativo: o que ele aponta vem dos dados reais, e
// cada aviso é uma pergunta que a administração pode responder abrindo o
// registro. Nada aqui altera dado: só lê e agrupa.
// ---------------------------------------------------------------------

/** Nome comparável: sem acento, caixa, pontuação nem sufixo societário (S.A., Ltda., ME). */
export function normalizarNome(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:/\\\-–—()'"&]/g, ' ')
    .replace(/\b(s\s*a|sa|ltda|ltd|me|epp|eireli|cia|companhia)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface GrupoDuplicado {
  /** Mesma razão social ou nome fantasia normalizado, ou mesma raiz de CNPJ (matriz e filiais). */
  motivo: 'nome' | 'raiz_cnpj';
  chave: string;
  empresas: Empresa[];
}

/**
 * Cadastros que podem ser a mesma empresa. O CNPJ completo já é único no
 * banco; aqui aparecem os que passaram por ele: o nome escrito de outro jeito
 * e as filiais de uma mesma raiz (que podem ser legítimas: a administração decide).
 */
export function duplicidades(empresas: Empresa[]): GrupoDuplicado[] {
  const grupos: GrupoDuplicado[] = [];
  const agrupar = (motivo: GrupoDuplicado['motivo'], chaveDe: (e: Empresa) => string[]) => {
    const m = new Map<string, Empresa[]>();
    for (const e of empresas) {
      for (const k of new Set(chaveDe(e).filter(Boolean))) m.set(k, [...(m.get(k) ?? []), e]);
    }
    for (const [chave, lista] of m) if (lista.length > 1) grupos.push({ motivo, chave, empresas: lista });
  };
  agrupar('nome', (e) => [normalizarNome(e.razao_social), e.nome_fantasia ? normalizarNome(e.nome_fantasia) : '']);
  agrupar('raiz_cnpj', (e) => [e.cnpj.replace(/\D/g, '').slice(0, 8)]);
  // Um par que se repete nos dois critérios aparece uma vez, no do nome.
  const vistos = new Set<string>();
  return grupos.filter((g) => {
    const id = g.empresas.map((e) => e.id).sort().join('|');
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  }).sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
}

export interface Participacao { contratante: number; executora: number; subcontratada: number; licencas: number }

const VAZIA: Participacao = { contratante: 0, executora: 0, subcontratada: 0, licencas: 0 };

/**
 * Em quantas licenças cada empresa aparece, por papel. `licencas` conta cada
 * licença uma vez por empresa, mesmo quando ela é contratante e executora ao
 * mesmo tempo (a própria contratante que executa).
 */
export function participacoes(ls: LicencaComTrechos[]): Map<string, Participacao> {
  const m = new Map<string, Participacao>();
  const ler = (id: string) => m.get(id) ?? { ...VAZIA };
  for (const l of ls) {
    const papeis: [string | null, keyof Omit<Participacao, 'licencas'>][] = [
      [l.contratante_id, 'contratante'], [l.executora_id, 'executora'], [l.subcontratada_id, 'subcontratada'],
    ];
    const nestaLicenca = new Set<string>();
    for (const [id, papel] of papeis) {
      if (!id) continue;
      const p = ler(id);
      p[papel]++;
      if (!nestaLicenca.has(id)) { p.licencas++; nestaLicenca.add(id); }
      m.set(id, p);
    }
  }
  return m;
}

export interface Inconsistencia { licenca: LicencaComTrechos; problemas: string[] }

/**
 * Licenças que merecem uma revisão: dado faltando, prazo vencido ou empresa
 * que deixou de poder atuar. Só aponta; a correção é feita no registro.
 * Registro histórico (anterior à Resolução) não é cobrado de As Built nem de recomposição.
 */
export function inconsistencias(
  ls: LicencaComTrechos[], hoje: string, empresas: Map<string, Empresa>,
): Inconsistencia[] {
  const r: Inconsistencia[] = [];
  for (const l of ls) {
    if (l.situacao === 'cancelada') continue;
    const p: string[] = [];
    const estado = estadoLicenca(l, hoje);
    const exec = l.executora_id ? empresas.get(l.executora_id) : undefined;

    if (estado === 'prazo_encerrado') p.push('Fim da obra ou serviço vencido, sem conclusão registrada.');
    if (!l.anterior_resolucao && l.situacao === 'deferida') {
      if (estado === 'concluida_sem_as_built') p.push('Concluída sem As Built (art. 26).');
      if (l.concluida_em && !l.recomposicao_data) p.push('Concluída sem a recomposição do pavimento registrada.');
    }
    if (l.situacao === 'deferida') {
      if (l.licenca_trechos.length === 0) p.push('Sem trecho cadastrado.');
      if (!l.inicio_previsto || !l.fim_previsto) p.push('Sem início ou fim da obra ou serviço.');
    }
    if (exec?.tipo === 'terceirizada' && !l.anterior_resolucao
        && !l.contratante_id && !l.orgao_contratante_id && !l.contratante_razao_social) {
      p.push('Executora terceirizada sem contratante.');
    }
    if (!l.executora_id && l.executora_razao_social) p.push('Executora sem cadastro no CADEX (registro histórico).');

    for (const [papel, id] of [['executora', l.executora_id], ['contratante', l.contratante_id], ['subcontratada', l.subcontratada_id]] as const) {
      const e = id ? empresas.get(id) : undefined;
      if (e && e.ativa === false) p.push(`A ${papel} (${e.nome_fantasia || e.razao_social}) está com o cadastro desativado.`);
    }
    // Obra ainda aberta cuja executora deixou de estar habilitada.
    if (exec && l.situacao === 'deferida' && !l.concluida_em && !podeAtuar(situacaoEfetiva(exec, hoje))) {
      p.push(`A executora (${exec.nome_fantasia || exec.razao_social}) não está habilitada hoje: ${situacaoEfetiva(exec, hoje).replace('_', ' ')}.`);
    }
    if (p.length > 0) r.push({ licenca: l, problemas: p });
  }
  return r.sort((a, b) => b.problemas.length - a.problemas.length || a.licenca.processo_sei.localeCompare(b.licenca.processo_sei));
}
