import type { Page, Route } from '@playwright/test';
import type { Empresa } from '../../src/lib/empresas';
import type { LicencaComTrechos } from '../../src/lib/licencas';
import type { Orgao } from '../../src/lib/orgaos';
import type { Conta } from '../../src/lib/contas';
import type { EventoAuditoria } from '../../src/lib/auditoria';
import { empresasPadrao, uuid } from './dados';

// ---------------------------------------------------------------------
// Supabase simulado, em memória. A aplicação roda de verdade no navegador
// e fala com um endereço que ninguém atende; este arquivo responde no lugar,
// guardando o estado (uma empresa desativada continua desativada ao
// recarregar a lista) e registrando cada chamada que a tela fez, para os
// testes conferirem o que foi enviado ao backend, e não só o que se vê.
//
// Só simula o que as telas testadas usam. Chamada que ninguém simulou
// devolve lista vazia e fica em `semSimulacao`, para o teste decidir se isso
// importa.
// ---------------------------------------------------------------------

export const SB = 'http://localhost:54321';

export type Perfil = 'gestor' | 'cisp' | 'licenciador';

export interface Cenario {
  perfil: Perfil;
  administrador: boolean;
  empresas: Empresa[];
  licencas: LicencaComTrechos[];
  orgaos: Orgao[];
  contas: Conta[];
  auditoria: EventoAuditoria[];
  /** Documentos oficiais emitidos (tabela documentos_oficiais). */
  documentos: Record<string, unknown>[];
  /** Obras e serviços sem licença (tabela intervencoes_sem_licenca). */
  semLicenca?: Record<string, unknown>[];
  /** Catálogo de tipos (tabela tipos_intervencao). Sem ele, vale o catálogo padrão de viário. */
  tipos?: Record<string, unknown>[];
  /** Suspensões e pedidos de correção gravados pela tela durante o teste. */
  suspensoes?: Record<string, unknown>[];
  pedidos?: Record<string, unknown>[];
}

export interface Chamada {
  metodo: string;
  /** Caminho depois de /rest/v1 ou /auth/v1, ex.: "licencas", "rpc/admin_definir_ativo". */
  caminho: string;
  /** Parâmetros da URL já decodificados. */
  consulta: URLSearchParams;
  corpo: unknown;
}

export interface Backend {
  estado: Cenario;
  chamadas: Chamada[];
  semSimulacao: string[];
  /** Chamadas a um caminho (e método, se dado). */
  de(caminho: string, metodo?: string): Chamada[];
  /** Faz as leituras daquela tabela falharem (HTTP 500) até `restaurar`. */
  falhar(tabela: string): void;
  restaurar(tabela: string): void;
  /** A próxima chamadas à função de borda (admin-contas) respondem com este erro, até passar `null`. */
  funcaoComErro(mensagem: string | null): void;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ID_USUARIO = uuid(900);

function sessao(email: string) {
  // Token com o nível aal2 (a verificação em duas etapas já feita); a aplicação lê o nível do próprio token.
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ID_USUARIO, aal: 'aal2', role: 'authenticated', exp: 4102444800 })}.sig`;
  const user = {
    id: ID_USUARIO, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {},
    factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }], created_at: '2026-01-01T00:00:00Z',
  };
  return { user, session: { access_token: jwt, refresh_token: 'r', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user } };
}

const contaVoce = (administrador: boolean, perfil: Perfil): Conta => ({
  user_id: ID_USUARIO, email: 'voce@teste', nome: 'Você', papel: perfil, administrador, ativo: true,
  criado_em: '2026-01-01T00:00:00Z', ultimo_acesso: '2026-10-12T10:00:00Z', mfa_ativa: true,
});

/** Filtros do PostgREST que as telas usam: coluna=eq.valor, as comparações de data, ilike e or de texto. */
function filtrar<T extends Record<string, unknown>>(linhas: T[], q: URLSearchParams): T[] {
  return linhas.filter((l) => {
    for (const [k, v] of q) {
      if (['select', 'order', 'offset', 'limit'].includes(k)) continue;
      // or=(campo.ilike.*termo*,...): a busca de texto; basta uma das colunas bater.
      if (k === 'or') {
        const bate = v.replace(/^\(|\)$/g, '').split(',').some((t) => {
          const m = t.match(/^(\w+)\.ilike\.(.*)$/);
          return !!m && String(l[m[1]] ?? '').toLowerCase().includes(m[2].replace(/\*/g, '').toLowerCase());
        });
        if (!bate) return false;
        continue;
      }
      const [op, ...resto] = v.split('.');
      const val = resto.join('.');
      const campo = l[k];
      if (op === 'eq' && String(campo) !== val) return false;
      if (op === 'ilike' && !String(campo ?? '').toLowerCase().includes(val.replace(/\*/g, '').toLowerCase())) return false;
      if (op === 'is' && val === 'null' && campo != null) return false;
      if (op === 'not' && val === 'is.null' && campo == null) return false;
      if (op === 'gte' && String(campo) < val) return false;
      if (op === 'lte' && String(campo) > val) return false;
    }
    return true;
  });
}

export async function instalarBackend(page: Page, parcial: Partial<Cenario> = {}): Promise<Backend> {
  const estado: Cenario = {
    perfil: 'gestor', administrador: false, empresas: empresasPadrao(), licencas: [], orgaos: [], contas: [], auditoria: [], documentos: [],
    ...parcial,
  };
  const chamadas: Chamada[] = [];
  const semSimulacao: string[] = [];
  const falhas = new Set<string>();
  let erroFuncao: string | null = null;
  const { user, session } = sessao('voce@teste');

  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['sb-localhost-auth-token', JSON.stringify(session)] as const);

  await page.route(`${SB}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const caminho = url.pathname.replace(/^\/(rest|auth)\/v1\//, '').replace(/^\//, '');
    const unico = (req.headers().accept ?? '').includes('vnd.pgrst.object');
    const contaExata = (req.headers().prefer ?? '').includes('count=exact');
    const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
    const responder = (corpo: unknown, extra: Record<string, string> = {}) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { ...CORS, ...extra }, body: JSON.stringify(corpo) });
    const vazio = () => route.fulfill({ status: 204, headers: CORS });
    const falha = () => route.fulfill({ status: 500, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'Falha simulada do servidor.' }) });

    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    let corpo: unknown = null;
    try { corpo = req.postData() ? JSON.parse(req.postData()!) : null; } catch { corpo = req.postData(); }
    chamadas.push({ metodo: req.method(), caminho, consulta: url.searchParams, corpo });

    /** Lista com paginação e contagem, e objeto único quando a tela pede um só. */
    const lista = (linhas: Record<string, unknown>[]) => {
      const dados = filtrar(linhas, url.searchParams);
      if (unico) return dados[0] ? responder(dados[0]) : route.fulfill({ status: 406, headers: CORS, contentType: 'application/json', body: JSON.stringify({ message: 'Nenhuma linha.' }) });
      const ini = Number(url.searchParams.get('offset') ?? '0');
      const lim = Number(url.searchParams.get('limit') ?? '1000');
      const pagina = dados.slice(ini, ini + lim);
      return responder(pagina, contaExata ? { 'content-range': `${pagina.length ? `${ini}-${ini + pagina.length - 1}` : '*'}/${dados.length}` } : {});
    };

    if (req.method() === 'GET' && falhas.has(caminho)) return falha();

    if (caminho === 'user') return responder(user);
    if (caminho === 'servidores') {
      const linha = { nome: 'Você', papel: estado.perfil, administrador: estado.administrador, ativo: true };
      return responder(unico ? linha : [linha]);
    }
    if (caminho === 'empresas') {
      if (req.method() === 'PATCH') {
        const id = (url.searchParams.get('id') ?? '').replace('eq.', '');
        estado.empresas = estado.empresas.map((e) => (e.id === id ? { ...e, ...(corpo as object) } : e));
        return vazio();
      }
      return lista(estado.empresas as unknown as Record<string, unknown>[]);
    }
    if (caminho === 'licencas') return lista(estado.licencas as unknown as Record<string, unknown>[]);
    if (caminho === 'tipos_intervencao') {
      const padrao = [
        { setor: 'telecom', codigo: 'vala', rotulo: 'Abertura de vala', ativo: true },
        { setor: 'viario', codigo: 'vala', rotulo: 'Abertura de vala', ativo: true },
        { setor: 'viario', codigo: 'bicicletario', rotulo: 'Bicicletário', ativo: true },
        { setor: 'viario', codigo: 'outros', rotulo: 'Outros (descrever)', ativo: true },
      ].map((t, i) => ({ ...t, id: uuid(8001 + i), fonte: 'Catálogo de teste', atualizado_em: '2026-10-14' }));
      return lista(estado.tipos ?? padrao);
    }
    if (caminho === 'licenca_suspensoes' || caminho === 'licenca_pedidos_correcao') {
      const linhas = (caminho === 'licenca_suspensoes' ? estado.suspensoes : estado.pedidos) ?? [];
      const lid = (url.searchParams.get('licenca_id') ?? '').replace('eq.', '');
      return lista(linhas.filter((x) => x.licenca_id === lid));
    }
    if (caminho === 'intervencoes_sem_licenca') {
      if (req.method() === 'POST') {
        const nova = { id: uuid(9000 + (estado.semLicenca?.length ?? 0) + 1), ...(corpo as object), atualizado_em: new Date().toISOString() };
        estado.semLicenca = [...(estado.semLicenca ?? []), nova];
        return vazio();
      }
      if (req.method() === 'PATCH') {
        const id = (url.searchParams.get('id') ?? '').replace('eq.', '');
        estado.semLicenca = (estado.semLicenca ?? []).map((x) => (x.id === id ? { ...x, ...(corpo as object) } : x));
        return vazio();
      }
      return lista(estado.semLicenca ?? []);
    }
    if (caminho === 'orgaos_publicos') return lista(estado.orgaos as unknown as Record<string, unknown>[]);
    if (caminho === 'auditoria') return lista(estado.auditoria as unknown as Record<string, unknown>[]);
    if (['vinculos', 'responsaveis_tecnicos', 'documentos', 'tipos_documento', 'funcionarios', 'veiculos'].includes(caminho)) return responder([]);

    if (caminho === 'rpc/admin_listar_contas') return responder([contaVoce(estado.administrador, estado.perfil), ...estado.contas]);
    if (caminho === 'rpc/admin_vinculos_da_conta') {
      return responder({ eventos_auditoria: 7, documentos_enviados: 2, mudancas_de_situacao: 0, licencas_excluidas: 0 });
    }
    if (caminho === 'functions/v1/admin-contas') {
      if (erroFuncao) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ erro: erroFuncao }) });
      const { acao, user_id } = corpo as { acao: string; user_id: string };
      if (acao === 'excluir') estado.contas = estado.contas.filter((c) => c.user_id !== user_id);
      return responder({ ok: true });
    }
    if (caminho === 'rpc/admin_definir_ativo') {
      const { p_user_id, p_ativo } = corpo as { p_user_id: string; p_ativo: boolean };
      estado.contas = estado.contas.map((c) => (c.user_id === p_user_id ? { ...c, ativo: p_ativo } : c));
      return vazio();
    }
    if (caminho === 'rpc/conflitos_de_licenca') return responder([]);
    if (caminho === 'rpc/emitir_documento') {
      // Numeração em memória, como o banco: 1, 2, 3... por emissão.
      const { p_tipo, p_empresa_id, p_dados } = corpo as { p_tipo: string; p_empresa_id: string; p_dados: Record<string, unknown> };
      const numero = estado.documentos.length + 1;
      const registro = { id: uuid(9000 + numero), tipo: p_tipo, numero, empresa_id: p_empresa_id, dados: p_dados,
        emitido_por: ID_USUARIO, emitido_em: '2026-10-19T12:00:00Z', codigo_verificacao: `A1B2C3D4E${numero}` };
      estado.documentos.push(registro);
      return responder([{ id: registro.id, numero, codigo_verificacao: registro.codigo_verificacao, emitido_em: registro.emitido_em }]);
    }
    if (caminho === 'documentos_oficiais') return lista(estado.documentos as unknown as Record<string, unknown>[]);
    if (caminho === 'rpc/salvar_licenca') {
      // Grava como o banco: a licença e os trechos passam a existir para as outras telas (lista, painel, mapa).
      const { p_licenca, p_trechos } = corpo as { p_licenca: Record<string, unknown>; p_trechos: Record<string, unknown>[] };
      const id = (p_licenca.id as string | undefined) ?? uuid(7000 + estado.licencas.length + 1);
      const trechos = p_trechos.map((t, i) => ({ id: (t.id as string | undefined) ?? uuid(8000 + i), ordem: i + 1, ...t }));
      const base = estado.licencas.find((l) => l.id === id);
      const nova = { ...(base ?? { codigo_publico: `c${id.slice(-4)}`, criado_em: new Date().toISOString() }), ...p_licenca, id,
        atualizado_em: new Date().toISOString(), licenca_trechos: trechos } as unknown as LicencaComTrechos;
      estado.licencas = base ? estado.licencas.map((l) => (l.id === id ? nova : l)) : [...estado.licencas, nova];
      return responder(id);
    }
    if (caminho === 'rpc/admin_excluir_licenca' || caminho === 'rpc/admin_restaurar_licenca' || caminho === 'rpc/admin_excluir_licenca_definitivamente') {
      const { p_id, p_motivo } = corpo as { p_id: string; p_motivo?: string | null };
      const l = estado.licencas.find((x) => x.id === p_id);
      if (!l) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ message: 'Licença não encontrada.' }) });
      if (caminho === 'rpc/admin_excluir_licenca') {
        estado.licencas = estado.licencas.map((x) => (x.id === p_id
          ? { ...x, excluida_em: new Date().toISOString(), excluida_por: ID_USUARIO, excluida_motivo: p_motivo ?? null } : x));
        return vazio();
      }
      if (caminho === 'rpc/admin_restaurar_licenca') {
        estado.licencas = estado.licencas.map((x) => (x.id === p_id ? { ...x, excluida_em: null, excluida_por: null, excluida_motivo: null } : x));
        return vazio();
      }
      estado.licencas = estado.licencas.filter((x) => x.id !== p_id);
      return responder({ numero: l.numero, processo_sei: l.processo_sei, trechos_apagados: l.licenca_trechos.length });
    }
    if (caminho === 'rpc/prorrogar_licenca') {
      // Como o banco: órgão público não se prorroga, a nova data precisa ser posterior, e a contagem sobe 1.
      const { p_id, p_validade } = corpo as { p_id: string; p_validade: string };
      const l = estado.licencas.find((x) => x.id === p_id);
      if (!l) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ message: 'Licença não encontrada.' }) });
      if (l.validade_ate && p_validade <= l.validade_ate) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ message: 'A nova validade precisa ser posterior à validade atual.' }) });
      estado.licencas = estado.licencas.map((x) => (x.id === p_id ? { ...x, validade_ate: p_validade, prorrogacoes: (x.prorrogacoes ?? 0) + 1 } : x));
      return vazio();
    }
    if (caminho === 'rpc/suspender_licenca') {
      const { p_id, p_inicio, p_motivo } = corpo as { p_id: string; p_inicio: string; p_motivo: string };
      const n = (estado.suspensoes ?? []).length;
      estado.suspensoes = [...(estado.suspensoes ?? []), { id: uuid(9500 + n), licenca_id: p_id, inicio: p_inicio, fim: null, motivo: p_motivo, criado_em: new Date().toISOString() }];
      return vazio();
    }
    if (caminho === 'rpc/retomar_licenca') {
      const { p_id, p_fim } = corpo as { p_id: string; p_fim: string };
      estado.suspensoes = (estado.suspensoes ?? []).map((s) => (s.licenca_id === p_id && s.fim === null ? { ...s, fim: p_fim } : s));
      return vazio();
    }
    if (caminho === 'rpc/pedir_correcao') {
      const { p_id, p_motivo } = corpo as { p_id: string; p_motivo: string };
      const n = (estado.pedidos ?? []).length;
      estado.pedidos = [...(estado.pedidos ?? []), { id: uuid(9700 + n), licenca_id: p_id, motivo: p_motivo, pedido_em: new Date().toISOString(), resolucao: null, resolvido_em: null }];
      return responder(uuid(9700 + n));
    }
    if (caminho === 'rpc/resolver_correcao') {
      const { p_pedido, p_resolucao } = corpo as { p_pedido: string; p_resolucao: string };
      estado.pedidos = (estado.pedidos ?? []).map((p) => (p.id === p_pedido ? { ...p, resolucao: p_resolucao, resolvido_em: new Date().toISOString() } : p));
      return vazio();
    }
    if (caminho === 'rpc/obras_publicas') return responder(obrasPublicas(estado));
    // Licença pública pelo código do QR. Sem executora vinculada, a resposta vem sem o campo.
    if (caminho === 'rpc/licenca_publica') {
      const achada = obrasPublicas(estado).find((o) => o.codigo === (corpo as { p_codigo?: string } | null)?.p_codigo);
      if (!achada) return responder(null);
      const { executora: _executora, ...resto } = achada;
      void _executora;
      const d = new Date();
      const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return responder({ ...resto, contratante: null, trechos: [], numero: achada.numero, hoje });
    }

    semSimulacao.push(`${req.method()} ${caminho}`);
    return responder(unico ? {} : []);
  });

  return {
    estado, chamadas, semSimulacao,
    de: (caminho, metodo) => chamadas.filter((c) => c.caminho === caminho && (!metodo || c.metodo === metodo)),
    falhar: (t) => { falhas.add(t); },
    restaurar: (t) => { falhas.delete(t); },
    funcaoComErro: (m) => { erroFuncao = m; },
  };
}

/** Espelha obras_publicas() do banco: só deferidas e canceladas, com a situação derivada das datas. */
function obrasPublicas(estado: Cenario) {
  const d = new Date(); const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nome = (e?: Empresa) => (e ? (e.nome_fantasia?.trim() || e.razao_social) : null);
  return estado.licencas.filter((l) => !l.excluida_em && (l.situacao === 'deferida' || l.situacao === 'cancelada')).map((l) => {
    const og = estado.orgaos.find((o) => o.id === l.orgao_contratante_id);
    // Mesma ordem de situacao_publica() no banco (migração 20261106120000).
    const suspensa = (estado.suspensoes ?? []).some((s) => s.licenca_id === l.id && s.fim === null);
    const situacao = l.situacao === 'cancelada' ? 'cancelada'
      : l.concluida_em && (!l.fim_previsto || hoje > l.fim_previsto) ? 'concluida'
        : suspensa ? 'suspensa'
          : l.validade_ate && hoje > l.validade_ate ? 'prazo_encerrado'
              : l.inicio_previsto && hoje < l.inicio_previsto ? 'aguardando_inicio' : 'vigente';
    return {
      codigo: l.codigo_publico, setor: l.setor, numero: l.numero, tipos_obra: l.tipos_obra, tipo_intervencao: l.tipo_intervencao,
      origem: l.origem_intervencao, escopo: l.escopo, inicio_previsto: l.inicio_previsto, fim_previsto: l.fim_previsto,
      situacao,
      executora: nome(estado.empresas.find((e) => e.id === l.executora_id)) ?? l.executora_razao_social,
      contratante: nome(estado.empresas.find((e) => e.id === l.contratante_id)) ?? og?.sigla ?? og?.nome ?? null,
      trechos: l.licenca_trechos.map((t) => ({
        logradouro: t.logradouro, bairro: t.bairro, inicio: [t.inicio_lng, t.inicio_lat],
        fim: t.fim_lat == null ? null : [t.fim_lng, t.fim_lat],
      })),
    };
  });
}
