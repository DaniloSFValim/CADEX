-- =====================================================================
-- Página pública da licença: só pelo código, só licença deferida ou
-- cancelada, sem dados internos; anônimo não lê as tabelas.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000051', 'gestor.pub@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-000000000051', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000051', true);

create temp table cod (nome text primary key, codigo text);
grant select on cod to anon;

do $$
declare op uuid; ex uuid; deferida uuid; analise uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Pública S.A.', 'OpPub', 'operadora', 'op@p.test') returning id into op;
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('11444777000161', 'Executora Pública Ltda.', 'terceirizada', 'ex@p.test') returning id into ex;
  insert into vinculos (contratante_id, contratada_id) values (op, ex);
  update empresas set situacao = 'apta', portaria_numero = 'P-9', portaria_data = hoje - 5 where id = ex;

  deferida := public.salvar_licenca(jsonb_build_object(
      'processo_sei', 'NIT-050120/000777/2026', 'numero', '077/2026', 'tipos_obra', array['vala'],
      'escopo', 'Travessia de rede', 'executora_id', ex, 'contratante_id', op, 'art_numero', 'ART-SIGILO',
      'observacoes', 'nota interna', 'protocolo_data', hoje - 20, 'situacao', 'deferida', 'decisao_data', hoje - 10,
      'inicio_previsto', hoje - 1, 'fim_previsto', hoje + 30),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua Gavião Peixoto', 'bairro', 'Icaraí',
      'inicio_lat', -22.9035, 'inicio_lng', -43.1102)));
  analise := public.salvar_licenca(jsonb_build_object(
      'processo_sei', 'NIT-050120/000778/2026', 'tipos_obra', array['poste'], 'escopo', 'Poste',
      'executora_id', ex, 'contratante_id', op, 'protocolo_data', hoje),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua X', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));

  insert into cod select 'deferida', codigo_publico from licencas where id = deferida;
  insert into cod select 'analise', codigo_publico from licencas where id = analise;

  perform pg_temp.assert((select codigo_publico ~ '^[0-9a-f]{24}$' from licencas where id = deferida),
    'código público fora do formato');
  perform pg_temp.assert((select count(distinct codigo_publico) = 2 from licencas where id in (deferida, analise)),
    'códigos públicos repetidos');
end $$;

-- Anônimo: só pela função, só o que é público
reset role;
set local role anon;
do $$
declare j jsonb := public.licenca_publica((select codigo from cod where nome = 'deferida'));
begin
  perform pg_temp.assert(j ->> 'numero' = '077/2026', 'anônimo não viu a licença deferida');
  perform pg_temp.assert(j ->> 'situacao' = 'vigente', 'situação de hoje errada: ' || (j ->> 'situacao'));
  perform pg_temp.assert(j -> 'executora' ->> 'razao_social' = 'Executora Pública Ltda.', 'sem a executora');
  perform pg_temp.assert(j -> 'executora' ->> 'situacao_cadex' = 'apta', 'sem a situação no CADEX');
  perform pg_temp.assert(j -> 'contratante' ->> 'razao_social' = 'Operadora Pública S.A.', 'sem a contratante');
  perform pg_temp.assert(jsonb_array_length(j -> 'trechos') = 1, 'sem os trechos');
  perform pg_temp.assert(j::text not like '%NIT-050120%' and j::text not like '%ART-SIGILO%'
                         and j::text not like '%nota interna%' and not (j ? 'id'),
    'vazou dado interno na página pública');

  perform pg_temp.assert(public.licenca_publica((select codigo from cod where nome = 'analise')) is null,
    'pedido em análise apareceu na página pública');
  perform pg_temp.assert(public.licenca_publica('000000000000000000000000') is null, 'código inexistente devolveu algo');
  perform pg_temp.assert(public.licenca_publica(upper((select codigo from cod where nome = 'deferida'))) is not null,
    'código em maiúsculas não foi aceito');

  begin
    perform 1 from public.licencas;
    raise exception 'ASSERT FALHOU: anônimo leu a tabela de licenças';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Cancelada continua consultável, com a situação de cancelada
reset role;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000051', true);
update licencas set situacao = 'cancelada' where numero = '077/2026';
reset role;
set local role anon;
do $$
begin
  perform pg_temp.assert(public.licenca_publica((select codigo from cod where nome = 'deferida')) ->> 'situacao' = 'cancelada',
    'licença cancelada não aparece como cancelada');
end $$;

rollback;
