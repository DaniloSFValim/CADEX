-- =====================================================================
-- CADEX — verificação em duas etapas obrigatória para gestor e
-- administrador
--
-- Os poderes de gestor (cadastrar, alterar, decidir inscrições) e de
-- administrador (dar e tirar acessos) só valem numa sessão confirmada com
-- o código do aplicativo autenticador: nível `aal2` no token. Com só a
-- senha, a pessoa entra, mas o banco recusa qualquer gravação e o site
-- pede o código (ou o cadastro do aplicativo, no primeiro acesso).
--
-- CISP só consulta e segue entrando com a senha.
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
