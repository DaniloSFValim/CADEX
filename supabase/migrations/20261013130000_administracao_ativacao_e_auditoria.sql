-- =====================================================================
-- CADEX — painel administrativo: desativar em vez de apagar, último
-- administrador protegido, empresa desativável e auditoria imutável
--
-- 1. servidores.ativo: o acesso se desativa e reativa sem perder nome,
--    perfil nem histórico. Desativado, o servidor deixa de passar em
--    is_servidor/is_gestor/is_licenciador/is_administrador, então o banco
--    recusa tudo, mesmo com uma sessão ainda aberta.
-- 2. O sistema não pode ficar sem administrador ativo. A conferência vale
--    para QUALQUER caminho (função, atualização direta, exclusão da conta
--    de login) e serializa as mudanças por um bloqueio consultivo, de modo
--    que dois administradores não se rebaixam ao mesmo tempo.
-- 3. empresas.ativa: só o administrador ativa e desativa o cadastro. Licença
--    não passa a usar empresa desativada (executora, contratante ou
--    subcontratada); a que já usa continua como está.
-- 4. A auditoria não se altera nem se apaga, nem por engano de quem tem
--    acesso direto ao banco. Para a retenção legal, só desligando o
--    gatilho de propósito. A leitura é do administrador (antes, de qualquer
--    gestor): a tela é da Administração e os valores têm dados sensíveis.
--
-- Reversão: remover os gatilhos e as funções novas, as duas colunas, trocar a
-- política auditoria_administrador pela auditoria_gestor (is_gestor()) e
-- reaplicar is_servidor/is_gestor/is_licenciador/is_administrador sem
-- "and ativo" (versões de 20260924130000, 20260930161147 e 20261007120000).
-- Nenhum dado existente é alterado: as colunas nascem verdadeiras.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Acesso ativo ou desativado
-- ---------------------------------------------------------------------
alter table public.servidores add column ativo boolean not null default true;

create or replace function public.is_servidor()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and ativo);
$$;

create or replace function public.is_gestor()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and papel = 'gestor' and ativo)
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_licenciador()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and papel = 'licenciador' and ativo)
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_administrador()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and administrador and ativo)
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- A lista de contas passa a dizer se o acesso está ativo.
drop function public.admin_listar_contas();

create function public.admin_listar_contas()
returns table (
  user_id uuid, email text, nome text, papel text, administrador boolean, ativo boolean,
  criado_em timestamptz, ultimo_acesso timestamptz, mfa_ativa boolean
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
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
      from auth.users u
      left join public.servidores s on s.user_id = u.id
     order by s.nome is null, s.nome, u.email;
end;
$$;

revoke execute on function public.admin_listar_contas() from public, anon;
grant  execute on function public.admin_listar_contas() to authenticated;

-- Ativa ou desativa o acesso de uma conta que já tem acesso ao CADEX.
create or replace function public.admin_definir_ativo(p_user_id uuid, p_ativo boolean)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_administrador() then
    raise exception 'Só administrador gerencia contas.' using errcode = '42501';
  end if;
  if p_ativo is null then
    raise exception 'Informe se o acesso fica ativo ou desativado.';
  end if;
  if p_user_id = auth.uid() and not p_ativo then
    raise exception 'Você não pode desativar o próprio acesso. Peça a outro administrador.';
  end if;
  update public.servidores set ativo = p_ativo where user_id = p_user_id;
  if not found then
    raise exception 'Esta conta não tem acesso ao CADEX.';
  end if;
end;
$$;

revoke execute on function public.admin_definir_ativo(uuid, boolean) from public, anon;
grant  execute on function public.admin_definir_ativo(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Último administrador ativo
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: quem dispara o gatilho nem sempre lê `servidores` (a exclusão da
-- conta de login pelo Auth, por exemplo), e a checagem não pode depender disso.
create or replace function public.servidores_protege_ultimo_administrador()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- Só importa quando um administrador ATIVO deixa de sê-lo: rebaixado, desativado ou excluído.
  if old.administrador and old.ativo
     and (tg_op = 'DELETE' or not new.administrador or not new.ativo) then
    -- Serializa: duas mudanças simultâneas não enxergam, cada uma, "o outro ainda é administrador".
    perform pg_advisory_xact_lock(hashtext('cadex.ultimo_administrador'));
    if not exists (select 1 from public.servidores s
                    where s.administrador and s.ativo and s.user_id <> old.user_id) then
      raise exception 'O sistema não pode ficar sem administrador ativo. Torne outra pessoa administradora antes.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.servidores_protege_ultimo_administrador() from public, anon, authenticated;

create trigger servidores_ultimo_administrador
  before update or delete on public.servidores
  for each row execute function public.servidores_protege_ultimo_administrador();

-- ---------------------------------------------------------------------
-- 3. Empresa ativa ou desativada
-- ---------------------------------------------------------------------
alter table public.empresas add column ativa boolean not null default true;

create or replace function public.empresas_protege_ativa()
returns trigger language plpgsql
set search_path = public as $$
begin
  -- Sem usuário no token (SQL Editor, chave de serviço) é acesso direto ao banco: confiável.
  if new.ativa is distinct from old.ativa and auth.uid() is not null and not public.is_administrador() then
    raise exception 'Só administrador ativa ou desativa o cadastro de uma empresa.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.empresas_protege_ativa() from public, anon, authenticated;

create trigger empresas_protege_ativa
  before update on public.empresas
  for each row execute function public.empresas_protege_ativa();

-- A licença não passa a usar empresa desativada. A que já usa segue como está.
-- SECURITY DEFINER: a checagem lê `empresas` sem depender da RLS de quem grava a licença;
-- se a RLS escondesse a linha, a conferência falharia aberta.
create or replace function public.licencas_exige_empresas_ativas()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v record;
begin
  for v in
    select * from (values
      ('executora',     new.executora_id,     case when tg_op = 'UPDATE' then old.executora_id end),
      ('contratante',   new.contratante_id,   case when tg_op = 'UPDATE' then old.contratante_id end),
      ('subcontratada', new.subcontratada_id, case when tg_op = 'UPDATE' then old.subcontratada_id end)
    ) as t(papel, novo, antigo)
  loop
    if v.novo is not null and v.novo is distinct from v.antigo
       and exists (select 1 from public.empresas e where e.id = v.novo and not e.ativa) then
      raise exception 'A empresa escolhida como % está desativada. Reative o cadastro ou escolha outra.', v.papel;
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.licencas_exige_empresas_ativas() from public, anon, authenticated;

create trigger licencas_empresas_ativas
  before insert or update on public.licencas
  for each row execute function public.licencas_exige_empresas_ativas();

-- ---------------------------------------------------------------------
-- 4. Auditoria imutável e só do administrador
-- ---------------------------------------------------------------------
-- A leitura passa de "qualquer gestor" para "administrador": os valores incluem
-- dados dos documentos e CPFs, e a tela da auditoria é da Administração. Nenhuma
-- outra tela do sistema lê esta tabela.
drop policy auditoria_gestor on public.auditoria;
create policy auditoria_administrador on public.auditoria
  for select to authenticated using (public.is_administrador());

create or replace function public.auditoria_imutavel()
returns trigger language plpgsql
set search_path = public as $$
begin
  raise exception 'O registro de auditoria não pode ser alterado nem apagado.';
end;
$$;

revoke execute on function public.auditoria_imutavel() from public, anon, authenticated;

create trigger auditoria_sem_alterar
  before update or delete on public.auditoria
  for each row execute function public.auditoria_imutavel();
create trigger auditoria_sem_truncar
  before truncate on public.auditoria
  for each statement execute function public.auditoria_imutavel();
