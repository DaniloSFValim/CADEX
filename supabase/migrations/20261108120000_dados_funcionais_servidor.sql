-- =====================================================================
-- Dados funcionais do servidor: matrícula e cargo. Saem no documento
-- oficial emitido, como o responsável pela emissão. Só o administrador
-- grava (pelo painel de contas); o próprio servidor lê os seus pela RLS
-- que já existe em `servidores`. A auditoria pega as mudanças.
-- =====================================================================

alter table public.servidores
  add column if not exists matricula text,
  add column if not exists cargo text;

-- A lista de contas passa a trazer matrícula e cargo, para o painel mostrar e editar.
-- Mantém as colunas que a tela já usa (ativo, mfa_ativa).
drop function if exists public.admin_listar_contas();
create function public.admin_listar_contas()
returns table (
  user_id uuid, email text, nome text, papel text, administrador boolean, ativo boolean,
  criado_em timestamptz, ultimo_acesso timestamptz, mfa_ativa boolean, matricula text, cargo text
)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, s.nome, s.papel, coalesce(s.administrador, false), coalesce(s.ativo, false),
           u.created_at, u.last_sign_in_at,
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
           s.matricula, s.cargo
      from auth.users u
      left join public.servidores s on s.user_id = u.id
     order by s.nome is null, s.nome, u.email;
end;
$$;

-- Grava matrícula e cargo de uma conta que já tem acesso ao CADEX.
create or replace function public.admin_definir_dados_funcionais(
  p_user_id uuid, p_matricula text, p_cargo text
)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.servidores where user_id = p_user_id) then
    raise exception 'Conta sem acesso ao CADEX. Dê o acesso antes de informar a matrícula.';
  end if;
  if btrim(coalesce(p_matricula, '')) = '' then
    raise exception 'Informe a matrícula.';
  end if;
  if btrim(coalesce(p_cargo, '')) = '' then
    raise exception 'Informe o cargo.';
  end if;
  update public.servidores
     set matricula = btrim(p_matricula), cargo = btrim(p_cargo)
   where user_id = p_user_id;
end;
$$;

revoke execute on function public.admin_listar_contas()                          from public, anon;
revoke execute on function public.admin_definir_dados_funcionais(uuid, text, text) from public, anon;

grant execute on function public.admin_listar_contas()                          to authenticated;
grant execute on function public.admin_definir_dados_funcionais(uuid, text, text) to authenticated;
