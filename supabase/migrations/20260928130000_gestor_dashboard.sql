-- =====================================================================
-- CADEX — dashboard para gestor
--
-- Mostra métricas críticas: análises pendentes há >15 dias, saneamentos
-- a vencer em até 7 dias, e inscrições a vencer em até 30 dias.
--
-- Todas as funções retornam apenas para o gestor (via RLS).
-- =====================================================================

-- Análises pendentes há mais de 15 dias (art. 7º, caput)
create or replace function public.dashboard_analises_pendentes()
returns table (
  id                uuid,
  razao_social      text,
  nome_fantasia     text,
  cnpj              text,
  tipo              text,
  data_requerimento date,
  dias_pendentes    bigint,
  processo_numero   text
)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_gestor() then
    raise exception 'Acesso negado';
  end if;
  return query
  select e.id, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo,
         e.data_requerimento,
         (current_date - e.data_requerimento)::bigint,
         e.processo_numero
    from public.empresas e
   where e.situacao = 'em_analise'
     and e.data_requerimento is not null
     and (current_date - e.data_requerimento) > 15
   order by e.data_requerimento asc;
end;
$$;

-- Saneamentos a vencer em até 7 dias (art. 8º, § 1º: prazo de 30 dias)
create or replace function public.dashboard_saneamentos_vencimento()
returns table (
  id                uuid,
  razao_social      text,
  nome_fantasia     text,
  cnpj              text,
  tipo              text,
  notificacao_data  date,
  dias_restantes    bigint,
  data_vencimento   date,
  processo_numero   text
)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_gestor() then
    raise exception 'Acesso negado';
  end if;
  return query
  select e.id, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo,
         e.notificacao_data,
         (e.notificacao_data + 30 - current_date)::bigint,
         (e.notificacao_data + 30),
         e.processo_numero
    from public.empresas e
   where e.situacao = 'em_saneamento'
     and e.notificacao_data is not null
     and (e.notificacao_data + 30 - current_date) <= 7
     and (e.notificacao_data + 30 - current_date) > 0
   order by e.notificacao_data asc;
end;
$$;

-- Inscrições a vencer em até 30 dias (art. 7º, § 1º: validade de 12 meses)
create or replace function public.dashboard_inscricoes_vencimento()
returns table (
  id               uuid,
  razao_social     text,
  nome_fantasia    text,
  cnpj             text,
  tipo             text,
  situacao_efetiva text,
  portaria_data    date,
  validade_ate     date,
  dias_restantes   bigint,
  processo_numero  text
)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_gestor() then
    raise exception 'Acesso negado';
  end if;
  return query
  select e.id, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo,
         public.situacao_efetiva(e.situacao, e.validade_ate),
         e.portaria_data, e.validade_ate,
         (e.validade_ate - current_date)::bigint,
         e.processo_numero
    from public.empresas e
   where e.situacao in ('apta', 'em_saneamento')
     and e.validade_ate is not null
     and e.validade_ate between current_date and current_date + 30
   order by e.validade_ate asc;
end;
$$;

-- Sumário: contagens das três métricas críticas
create or replace function public.dashboard_sumario()
returns table (
  analises_pendentes    bigint,
  saneamentos_vencendo  bigint,
  inscricoes_vencendo   bigint
)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_gestor() then
    raise exception 'Acesso negado';
  end if;
  return query
  select
    (select count(*) from public.dashboard_analises_pendentes()),
    (select count(*) from public.dashboard_saneamentos_vencimento()),
    (select count(*) from public.dashboard_inscricoes_vencimento());
end;
$$;

grant execute on function public.dashboard_analises_pendentes()    to authenticated;
grant execute on function public.dashboard_saneamentos_vencimento() to authenticated;
grant execute on function public.dashboard_inscricoes_vencimento()  to authenticated;
grant execute on function public.dashboard_sumario()                to authenticated;

-- RLS: apenas gestor acessa
revoke execute on function public.dashboard_analises_pendentes()    from public, anon;
revoke execute on function public.dashboard_saneamentos_vencimento() from public, anon;
revoke execute on function public.dashboard_inscricoes_vencimento()  from public, anon;
revoke execute on function public.dashboard_sumario()                from public, anon;
