// CADEX — criação de contas de login, redefinição de senha e zerar a
// verificação em duas etapas (celular perdido).
//
// Só isto precisa da chave de serviço do Supabase, que nunca vai ao
// navegador. Quem chama tem de ser administrador (is_administrador(), com
// o token da própria pessoa). O acesso ao CADEX é gravado pela função
// admin_definir_acesso, também com o token de quem chamou: a auditoria
// registra o administrador, não a chave de serviço.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SENHA_MINIMA = 10;
const PAPEIS = ['gestor', 'cisp'];

function resposta(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });

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
    return resposta(403, { erro: 'Só administrador gerencia contas.' });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return resposta(400, { erro: 'Pedido inválido.' });
  }

  const admin = createClient(url, servico, { auth: { persistSession: false } });

  if (corpo.acao === 'zerar_mfa') {
    const userId = typeof corpo.user_id === 'string' ? corpo.user_id : '';
    if (!userId) return resposta(400, { erro: 'Conta não informada.' });
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) return resposta(400, { erro: `Não foi possível ler a verificação: ${error.message}` });
    for (const f of data?.factors ?? []) {
      const r = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
      if (r.error) return resposta(400, { erro: `Não foi possível zerar a verificação: ${r.error.message}` });
    }
    return resposta(200, { ok: true });
  }

  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
  if (senha.length < SENHA_MINIMA) {
    return resposta(400, { erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.` });
  }

  if (corpo.acao === 'criar') {
    const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
    const nome = typeof corpo.nome === 'string' ? corpo.nome.trim() : '';
    const papel = typeof corpo.papel === 'string' ? corpo.papel : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta(400, { erro: 'E-mail inválido.' });
    if (!nome) return resposta(400, { erro: 'Informe o nome do servidor.' });
    if (!PAPEIS.includes(papel)) return resposta(400, { erro: 'Perfil inválido.' });

    const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (criado.error || !criado.data.user) {
      const jaExiste = /already|registered|exists/i.test(criado.error?.message ?? '');
      return resposta(400, {
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
      return resposta(400, { erro: acesso.error.message });
    }
    return resposta(200, { ok: true, user_id: criado.data.user.id });
  }

  if (corpo.acao === 'redefinir_senha') {
    const userId = typeof corpo.user_id === 'string' ? corpo.user_id : '';
    if (!userId) return resposta(400, { erro: 'Conta não informada.' });
    const { error } = await admin.auth.admin.updateUserById(userId, { password: senha });
    if (error) return resposta(400, { erro: `Não foi possível redefinir a senha: ${error.message}` });
    return resposta(200, { ok: true });
  }

  return resposta(400, { erro: 'Ação desconhecida.' });
});
