-- =====================================================================
-- CADEX — exclusão de usuário pelo painel administrativo
--
-- Excluir uma conta tem duas metades, nesta ordem:
--   1. admin_excluir_conta (aqui): confere as proteções, guarda uma
--      identificação do que foi excluído (usuarios_excluidos), registra
--      na auditoria e REMOVE O ACESSO ao CADEX. Daí em diante a pessoa não
--      lê nem grava nada, mesmo com uma sessão ainda aberta.
--   2. A função de borda admin-contas apaga a conta de login (credenciais
--      e sessões), com a chave de serviço.
-- Se a 2ª metade falhar, a conta fica sem acesso e aparece em "Sem acesso
-- ao CADEX": nada fica pela metade com acesso, e o administrador tenta de novo.
--
-- Rastreabilidade: a auditoria guarda o nome de quem agiu no momento da
-- ação (por_nome) e o id (por), sem chave estrangeira; por isso o histórico
-- sobrevive à exclusão. Dois campos (documentos.enviado_por e
-- historico_situacao.por) apontam para a conta e ficam em branco quando ela
-- é apagada; a tela avisa quantos são antes de confirmar.
--
-- Proteções: só administrador; ninguém exclui a si mesmo; o último
-- administrador ativo não é excluído (também pelo gatilho de servidores).
--
-- Reversão: remover as funções e a tabela usuarios_excluidos. Contas já
-- excluídas não voltam; o registro delas permanece.
-- =====================================================================

create table if not exists public.usuarios_excluidos (
  user_id           uuid primary key,
  email             text,
  nome              text,
  papel             text,
  administrador     boolean not null default false,
  ultimo_acesso     timestamptz,
  excluido_em       timestamptz not null default now(),
  excluido_por      uuid,
  excluido_por_nome text,
  registros         jsonb not null default '{}'::jsonb
);

alter table public.usuarios_excluidos enable row level security;
revoke all on public.usuarios_excluidos from anon, authenticated;
grant select on public.usuarios_excluidos to authenticated;
create policy usuarios_excluidos_administrador on public.usuarios_excluidos
  for select to authenticated using (public.is_administrador());

-- O que a conta tem de registros ligados a ela, para conferir antes de excluir.
create or replace function public.admin_vinculos_da_conta(p_user_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'eventos_auditoria', (select count(*) from auditoria where por = p_user_id),
    'documentos_enviados', (select count(*) from documentos where enviado_por = p_user_id),
    'mudancas_de_situacao', (select count(*) from historico_situacao where por = p_user_id),
    'licencas_excluidas', (select count(*) from licencas where excluida_por = p_user_id));
end $$;

create or replace function public.admin_excluir_conta(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_conta  record;
  v_serv   public.servidores;
  v_snap   jsonb;
  v_quem   text;
begin
  if not public.is_administrador() then
    raise exception 'Só administrador exclui contas.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode excluir a própria conta.';
  end if;
  select u.id, u.email, u.last_sign_in_at into v_conta from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  select * into v_serv from servidores where user_id = p_user_id;
  if found and v_serv.administrador and v_serv.ativo
     and not exists (select 1 from servidores where administrador and ativo and user_id <> p_user_id) then
    raise exception 'Não é possível excluir o último administrador ativo.';
  end if;

  select nome into v_quem from servidores where user_id = auth.uid();
  v_snap := jsonb_build_object(
    'email', v_conta.email, 'nome', v_serv.nome, 'papel', v_serv.papel, 'administrador', coalesce(v_serv.administrador, false),
    'vinculos', public.admin_vinculos_da_conta(p_user_id));

  insert into usuarios_excluidos (user_id, email, nome, papel, administrador, ultimo_acesso, excluido_por, excluido_por_nome, registros)
  values (p_user_id, v_conta.email, v_serv.nome, v_serv.papel, coalesce(v_serv.administrador, false), v_conta.last_sign_in_at,
          auth.uid(), v_quem, v_snap -> 'vinculos')
  on conflict (user_id) do update set excluido_em = now(), excluido_por = auth.uid(), excluido_por_nome = v_quem,
    email = excluded.email, nome = coalesce(excluded.nome, usuarios_excluidos.nome), papel = coalesce(excluded.papel, usuarios_excluidos.papel),
    administrador = excluded.administrador, ultimo_acesso = excluded.ultimo_acesso, registros = excluded.registros;

  insert into auditoria (por, por_nome, tabela, registro_id, empresas, operacao, antes, depois)
  values (auth.uid(), v_quem, 'contas', p_user_id, '{}', 'DELETE', v_snap, null);

  -- Remove o acesso. O gatilho de servidores recusa, de novo, o último administrador.
  delete from servidores where user_id = p_user_id;
  return v_snap;
end $$;

revoke execute on function public.admin_vinculos_da_conta(uuid) from public, anon;
revoke execute on function public.admin_excluir_conta(uuid) from public, anon;
grant  execute on function public.admin_vinculos_da_conta(uuid) to authenticated;
grant  execute on function public.admin_excluir_conta(uuid) to authenticated;
