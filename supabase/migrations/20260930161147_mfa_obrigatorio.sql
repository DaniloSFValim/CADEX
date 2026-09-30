-- =====================================================================
-- CADEX — verificação em duas etapas obrigatória para o gestor
--
-- Os poderes de gestor (cadastrar, alterar, decidir inscrições) e de
-- administrador (dar e tirar acessos) só valem numa sessão confirmada com
-- o código do aplicativo autenticador: nível `aal2` no token. Com só a
-- senha, a pessoa entra, mas o banco recusa qualquer gravação e o site
-- pede o código (ou o cadastro do aplicativo, no primeiro acesso).
--
-- CISP só consulta e segue entrando com a senha. Por isso só gestor pode
-- ser administrador: senão um administrador de perfil CISP gerenciaria
-- contas sem o código do aplicativo.
--
-- Celular perdido: um administrador zera a verificação pelo painel de
-- contas (Edge Function admin-contas) e a pessoa cadastra de novo.
-- =====================================================================

create or replace function public.is_gestor()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and papel = 'gestor')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_administrador()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and administrador)
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke execute on function public.is_gestor()        from public, anon;
revoke execute on function public.is_administrador() from public, anon;
grant  execute on function public.is_gestor()        to authenticated;
grant  execute on function public.is_administrador() to authenticated;

-- A lista de contas passa a dizer quem já cadastrou o aplicativo.
drop function public.admin_listar_contas();

create function public.admin_listar_contas()
returns table (
  user_id uuid, email text, nome text, papel text, administrador boolean,
  criado_em timestamptz, ultimo_acesso timestamptz, mfa_ativa boolean
)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, s.nome, s.papel, coalesce(s.administrador, false),
           u.created_at, u.last_sign_in_at,
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
      from auth.users u
      left join public.servidores s on s.user_id = u.id
     order by s.nome is null, s.nome, u.email;
end;
$$;

revoke execute on function public.admin_listar_contas() from public, anon;
grant  execute on function public.admin_listar_contas() to authenticated;

-- Administrador só com perfil gestor (que exige o código do aplicativo).
alter table public.servidores
  add constraint servidores_administrador_gestor check (not administrador or papel = 'gestor');

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
  if coalesce(p_administrador, false) and p_papel is distinct from 'gestor' then
    raise exception 'Só servidor com perfil SECONSER (gestor) pode ser administrador de contas.';
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
