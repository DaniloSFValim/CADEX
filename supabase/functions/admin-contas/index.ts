// CADEX — criação de contas de login, redefinição de senha, zerar a
// verificação em duas etapas (celular perdido) e exclusão de conta.
//
// Só isto precisa da chave de serviço do Supabase, que nunca vai ao
// navegador. Quem chama tem de ser administrador (is_administrador(), com
// o token da própria pessoa). O acesso ao CADEX é gravado pela função
// admin_definir_acesso, também com o token de quem chamou: a auditoria
// registra o administrador, não a chave de serviço.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Origens que podem chamar esta função: a variável ORIGENS_PERMITIDAS, separada por vírgula
// (ex.: https://cadex.exemplo.gov.br). Sem a variável, nenhuma origem recebe cabeçalho CORS.
const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);

function cabecalhosCors(origem: string): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  return ORIGENS.includes(origem) ? { ...base, 'Access-Control-Allow-Origin': origem } : base;
}

const SENHA_MINIMA = 10;
const PAPEIS = ['gestor', 'cisp', 'licenciador'];
// Representantes de empresa: acesso ao portal das empresas. Não são servidores.
const PAPEIS_EMPRESA = ['representante', 'operador'];

function resposta(status: number, corpo: Record<string, unknown>, cabecalhos: Record<string, string>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = cabecalhosCors(req.headers.get('Origin') ?? '');
  const r = (status: number, corpo: Record<string, unknown>) => resposta(status, corpo, cors);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return r(405, { erro: 'Método não permitido.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = req.headers.get('Authorization') ?? '';

  const comoQuemChamou = createClient(url, anon, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false },
  });
  const { data: ehAdmin, error: erroAdmin } = await comoQuemChamou.rpc('is_administrador');
  if (erroAdmin || ehAdmin !== true) {
    return r(403, { erro: 'Só administrador gerencia contas.' });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return r(400, { erro: 'Pedido inválido.' });
  }

  const admin = createClient(url, servico, { auth: { persistSession: false } });

  if (corpo.acao === 'zerar_mfa') {
    const userId = typeof corpo.user_id === 'string' ? corpo.user_id : '';
    if (!userId) return r(400, { erro: 'Conta não informada.' });
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) return r(400, { erro: `Não foi possível ler a verificação: ${error.message}` });
    for (const f of data?.factors ?? []) {
      const removido = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
      if (removido.error) return r(400, { erro: `Não foi possível zerar a verificação: ${removido.error.message}` });
    }
    return r(200, { ok: true });
  }

  if (corpo.acao === 'excluir') {
    const userId = typeof corpo.user_id === 'string' ? corpo.user_id : '';
    if (!userId) return r(400, { erro: 'Conta não informada.' });
    // 1ª metade, com o token de quem chamou (a auditoria registra o administrador): confere as
    // proteções (só administrador, nunca a si mesmo, nunca o último administrador ativo), guarda a
    // identificação e REMOVE O ACESSO ao CADEX.
    const rpc = await comoQuemChamou.rpc('admin_excluir_conta', { p_user_id: userId });
    if (rpc.error) return r(400, { erro: rpc.error.message });
    // 2ª metade, com a chave de serviço: apaga a conta de login (credenciais e sessões). Se falhar, a
    // conta já está sem acesso; o administrador pode repetir a exclusão.
    const apagado = await admin.auth.admin.deleteUser(userId);
    if (apagado.error && !/not.?found/i.test(apagado.error.message)) {
      return r(502, {
        erro: `O acesso ao CADEX foi removido, mas a conta de login não pôde ser apagada (${apagado.error.message}). Tente excluir de novo.`,
      });
    }
    return r(200, { ok: true });
  }

  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
  if (senha.length < SENHA_MINIMA) {
    return r(400, { erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.` });
  }

  if (corpo.acao === 'criar') {
    const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
    const nome = typeof corpo.nome === 'string' ? corpo.nome.trim() : '';
    const papel = typeof corpo.papel === 'string' ? corpo.papel : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return r(400, { erro: 'E-mail inválido.' });
    if (!nome) return r(400, { erro: 'Informe o nome do servidor.' });
    if (!PAPEIS.includes(papel)) return r(400, { erro: 'Perfil inválido.' });

    const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (criado.error || !criado.data.user) {
      const jaExiste = /already|registered|exists/i.test(criado.error?.message ?? '');
      return r(400, {
        erro: jaExiste
          ? 'Já existe uma conta com este e-mail. Dê acesso a ela pela lista de contas.'
          : `Não foi possível criar a conta: ${criado.error?.message ?? 'erro desconhecido'}`,
      });
    }

    const acesso = await comoQuemChamou.rpc('admin_definir_acesso', {
      p_user_id: criado.data.user.id,
      p_nome: nome,
      p_papel: papel,
      p_administrador: corpo.administrador === true,
    });
    if (acesso.error) {
      // Sem o acesso gravado, a conta de login não serve para nada: desfaz.
      await admin.auth.admin.deleteUser(criado.data.user.id);
      return r(400, { erro: acesso.error.message });
    }
    return r(200, { ok: true, user_id: criado.data.user.id });
  }

  if (corpo.acao === 'criar_representante') {
    const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
    const nome = typeof corpo.nome === 'string' ? corpo.nome.trim() : '';
    const papel = typeof corpo.papel === 'string' ? corpo.papel : '';
    const empresaId = typeof corpo.empresa_id === 'string' ? corpo.empresa_id : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return r(400, { erro: 'E-mail inválido.' });
    if (!nome) return r(400, { erro: 'Informe o nome do representante.' });
    if (!PAPEIS_EMPRESA.includes(papel)) return r(400, { erro: 'Papel inválido.' });
    if (!empresaId) return r(400, { erro: 'Empresa não informada.' });
    // Só empresa cadastrada e ativa recebe representante. Confere com a chave de serviço,
    // porque o vínculo ainda não existe e a leitura de quem chamou pode não enxergar a empresa.
    const { data: empresa, error: erroEmpresa } = await admin
      .from('empresas').select('id, ativa').eq('id', empresaId).maybeSingle();
    if (erroEmpresa || !empresa || empresa.ativa !== true) {
      return r(400, { erro: 'Empresa não encontrada ou desativada no CADEX.' });
    }
    const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (criado.error || !criado.data.user) {
      const jaExiste = /already|registered|exists/i.test(criado.error?.message ?? '');
      return r(400, {
        erro: jaExiste
          ? 'Já existe uma conta com este e-mail. Use outro e-mail para o representante.'
          : `Não foi possível criar a conta: ${criado.error?.message ?? 'erro desconhecido'}`,
      });
    }
    // O vínculo é gravado com o token de quem chamou: a regra de gravação (gestor com
    // verificação em duas etapas) é conferida no banco, e a auditoria registra o gestor.
    const vinculo = await comoQuemChamou.from('empresa_usuarios').insert({
      user_id: criado.data.user.id, empresa_id: empresaId, papel, ativo: true, nome, email,
    });
    if (vinculo.error) {
      // Sem o vínculo, a conta de login não dá acesso a nada: desfaz.
      await admin.auth.admin.deleteUser(criado.data.user.id);
      return r(400, { erro: vinculo.error.message });
    }
    return r(200, { ok: true, user_id: criado.data.user.id });
  }

  if (corpo.acao === 'redefinir_senha') {
    const userId = typeof corpo.user_id === 'string' ? corpo.user_id : '';
    if (!userId) return r(400, { erro: 'Conta não informada.' });
    const { error } = await admin.auth.admin.updateUserById(userId, { password: senha });
    if (error) return r(400, { erro: `Não foi possível redefinir a senha: ${error.message}` });
    return r(200, { ok: true });
  }

  return r(400, { erro: 'Ação desconhecida.' });
});
