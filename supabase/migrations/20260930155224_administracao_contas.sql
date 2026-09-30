-- =====================================================================
-- CADEX — administração de contas
--
-- Quem é administrador gerencia as contas pelo site: vê todas as contas
-- de login, dá ou tira acesso, define o perfil (gestor ou CISP) e a
-- própria administração. O perfil continua decidindo o que cada um faz
-- no cadastro; ser administrador só acrescenta a gestão de contas.
--
-- Tudo passa por funções que conferem is_administrador(): a tabela
-- `servidores` segue sem INSERT/UPDATE/DELETE para `authenticated`, então
-- ninguém se promove gravando direto nela. Cada mudança cai na auditoria.
--
-- Criar conta de login e trocar senha de terceiros exigem a chave de
-- serviço do Supabase; isso fica na Edge Function `admin-contas`, que
-- também só atende administrador.
-- =====================================================================

alter table public.servidores
  add column administrador boolean not null default false;

create or replace function public.is_administrador()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and administrador);
$$;

revoke execute on function public.is_administrador() from public, anon;
grant  execute on function public.is_administrador() to authenticated;

-- Todas as contas de login, com ou sem acesso ao CADEX.
create or replace function public.admin_listar_contas()
returns table (
  user_id uuid, email text, nome text, papel text, administrador boolean,
  criado_em timestamptz, ultimo_acesso timestamptz
)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, s.nome, s.papel, coalesce(s.administrador, false),
           u.created_at, u.last_sign_in_at
      from auth.users u
      left join public.servidores s on s.user_id = u.id
     order by s.nome is null, s.nome, u.email;
end;
$$;

-- Dá acesso ou altera nome, perfil e administração de uma conta.
create or replace function public.admin_definir_acesso(
  p_user_id uuid, p_nome text, p_papel text, p_administrador boolean
)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Conta de login não encontrada.';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome do servidor.';
  end if;
  -- Nunca deixar o sistema sem administrador por engano.
  if p_user_id = auth.uid() and not coalesce(p_administrador, false) then
    raise exception 'Você não pode tirar a própria administração. Peça a outro administrador.';
  end if;

  insert into public.servidores (user_id, nome, papel, administrador)
  values (p_user_id, btrim(p_nome), p_papel, coalesce(p_administrador, false))
  on conflict (user_id) do update
    set nome = excluded.nome, papel = excluded.papel, administrador = excluded.administrador;
end;
$$;

-- Tira o acesso ao CADEX. A conta de login continua existindo.
create or replace function public.admin_remover_acesso(p_user_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode remover o próprio acesso.';
  end if;
  delete from public.servidores where user_id = p_user_id;
end;
$$;

revoke execute on function public.admin_listar_contas()                          from public, anon;
revoke execute on function public.admin_definir_acesso(uuid, text, text, boolean) from public, anon;
revoke execute on function public.admin_remover_acesso(uuid)                      from public, anon;
grant  execute on function public.admin_listar_contas()                          to authenticated;
grant  execute on function public.admin_definir_acesso(uuid, text, text, boolean) to authenticated;
grant  execute on function public.admin_remover_acesso(uuid)                      to authenticated;
