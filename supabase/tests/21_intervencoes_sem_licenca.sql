-- =====================================================================
-- Obras e serviços sem licença: regras de coerência, permissões,
-- auditoria, e que as licenças e a consulta pública não mudam.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create or replace function pg_temp.recusa(p_sql text, p_trecho text, p_msg text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FALHOU: %', p_msg;
exception
  when raise_exception or check_violation or unique_violation or insufficient_privilege or not_null_violation then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'gestor.isl@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000e2', 'licenciador.isl@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000e3', 'cisp.isl@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000e1', 'Gestor', 'gestor', false),
  ('00000000-0000-4000-8000-0000000000e2', 'Licenciador', 'licenciador', false),
  ('00000000-0000-4000-8000-0000000000e3', 'Consulta', 'cisp', false);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant anon to cadex_test_app;

create temp table ids (nome text primary key, id uuid);
grant select, insert on ids to public;

-- Cadastros de base e uma licença, criados como o dono da tabela (o gestor não cadastra órgão).
do $$
declare op uuid; ter uuid; org uuid; sec uuid; lic uuid;
begin
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras)
  values ('12345678000195', 'Operadora ISL S.A.', 'operadora', 'o@isl.test', '{telecom}', true) returning id into op;
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('11222333000181', 'Terceirizada ISL Ltda.', 'terceirizada', 't@isl.test', '{telecom}') returning id into ter;
  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Secretaria de Obras ISL', 'SOISL', 'municipal', 'administracao_direta', '{}') returning id into org;
  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Secretaria de Conservação ISL', 'SECISL', 'municipal', 'administracao_direta', '{}') returning id into sec;
  alter table licencas disable trigger licencas_antes_de_gravar;
  insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data, situacao,
                        inicio_previsto, fim_previsto)
  values ('telecom', 'LIC-ISL-1', array['vala'], 'Licença de referência', op, op, '2026-09-10', 'deferida',
          '2026-10-01', '2026-10-30') returning id into lic;
  alter table licencas enable trigger licencas_antes_de_gravar;
  insert into ids values ('op', op), ('ter', ter), ('org', org), ('sec', sec), ('lic', lic);
end $$;

-- Referência: licenças e consulta pública antes dos registros novos.
create temp table ref (k text primary key, v bigint);
grant all on ref to public;
insert into ref values
  ('licencas', (select count(*) from licencas)),
  ('publicas', (select jsonb_array_length(public.obras_publicas())));

do $$
declare sec uuid := (select id from ids where nome = 'sec'); org uuid := (select id from ids where nome = 'org');
begin
  -- Como o gestor (lê e grava).
  set local role cadex_test_app;
end $$;

select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000e1', true);

do $$
declare
  op uuid := (select id from ids where nome = 'op');
  ter uuid := (select id from ids where nome = 'ter');
  org uuid := (select id from ids where nome = 'org');
  sec uuid := (select id from ids where nome = 'sec');
  a uuid; b uuid; c uuid;
begin
  -- 1. Própria da SECONSER: o órgão executa, sem empresa.
  insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, logradouro,
    inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao)
  values ('viario', array['vala'], 'servico', 'Manutenção de meio-fio', sec, 'propria_orgao', 'Rua Visconde do Rio Branco', -22.8955, -43.1245,
    '2026-10-05', '2026-10-20', 'em_execucao') returning id into a;
  insert into ids values ('propria', a);

  -- 2. Contratada por outro órgão, com empresa cadastrada.
  insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, executora_id,
    logradouro, inicio_lat, inicio_lng, fim_lat, fim_lng)
  values ('telecom', array['vala'], 'obra', 'Poste novo', org, 'empresa', ter, 'Rua Mem de Sá', -22.905, -43.110, -22.906, -43.109)
  returning id into b;

  -- 3. Contratada por outro órgão, empresa fora do cadastro.
  insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    executora_razao_social, executora_cnpj, logradouro, inicio_lat, inicio_lng)
  values ('drenagem', array['vala'], 'obra', 'Desobstrução de galeria', org, 'sem_cadastro', 'Construtora Externa Ltda.', '24144040000175',
    'Rua Otávio Carneiro', -22.9010, -43.1180)
  returning id into c;
  insert into ids values ('sem_cad', c), ('contratada', b);

  -- Sem processo SEI, mais de um registro pode existir.
  insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, executora_id,
    logradouro, inicio_lat, inicio_lng)
  values ('telecom', array['vala'], 'servico', 'Religação', org, 'empresa', ter, 'Rua X', -22.90, -43.11);
end $$;

-- Coerência: cada combinação errada é recusada.
do $$
declare org uuid := (select id from ids where nome = 'org'); sec uuid := (select id from ids where nome = 'sec');
  op uuid := (select id from ids where nome = 'op'); ter uuid := (select id from ids where nome = 'ter');
begin
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, executora_id, logradouro, inicio_lat, inicio_lng)
    values ('telecom', array['vala'], 'obra','x','%s','propria_orgao','%s','R',-22.90,-43.11)$q$, sec, op),
    'isl_executora_coerente', 'órgão próprio com empresa foi aceito');
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng)
    values ('telecom', array['vala'], 'obra','x','%s','empresa','R',-22.90,-43.11)$q$, org),
    'isl_executora_coerente', 'empresa sem executora foi aceita');
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, executora_razao_social, logradouro, inicio_lat, inicio_lng)
    values ('telecom', array['vala'], 'obra','x','%s','sem_cadastro','  ','R',-22.90,-43.11)$q$, org),
    'isl_executora_coerente', 'empresa sem cadastro sem nome foi aceita');
  -- Terceirizada de telecom não atua em viário.
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, executora_id, logradouro, inicio_lat, inicio_lng)
    values ('viario', array['vala'], 'obra','x','%s','empresa','%s','R',-22.90,-43.11)$q$, org, ter),
    'não atua no setor', 'empresa fora do setor foi aceita');
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng, inicio_previsto, fim_previsto)
    values ('telecom', array['vala'], 'obra','x','%s','propria_orgao','R',-22.90,-43.11,'2026-10-20','2026-10-01')$q$, sec),
    'isl_periodo', 'período invertido foi aceito');
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng, situacao)
    values ('telecom', array['vala'], 'obra','x','%s','propria_orgao','R',-22.90,-43.11,'concluida')$q$, sec),
    'isl_concluida', 'concluída sem data de conclusão foi aceita');
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng)
    values ('telecom', array['vala'], 'obra','x','%s','propria_orgao','R',-23.50,-43.11)$q$, sec),
    'intervencoes_sem_licenca_inicio_lat_check', 'coordenada fora de Niterói foi aceita');
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, executora_razao_social, executora_cnpj, logradouro, inicio_lat, inicio_lng)
    values ('telecom', array['vala'], 'obra','x','%s','sem_cadastro','Y','123','R',-22.90,-43.11)$q$, org),
    'executora_cnpj', 'CNPJ inválido foi aceito');
  -- Processo SEI é guardado em maiúsculas e sem espaços.
  insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, logradouro, inicio_lat, inicio_lng, processo_sei)
  values ('telecom', array['vala'], 'obra','com processo',sec,'propria_orgao','R',-22.90,-43.11,'  sei-dup-1  ');
end $$;

-- Processo SEI repetido entre registros é recusado.
do $$
declare sec uuid := (select id from ids where nome = 'sec');
begin
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng, processo_sei)
    values ('telecom', array['vala'], 'obra','repetido','%s','propria_orgao','R',-22.90,-43.11,'SEI-DUP-1')$q$, sec),
    'intervencoes_sem_licenca_processo_uk', 'processo SEI repetido foi aceito');
end $$;

-- Regularização: quando a licença é apagada, o vínculo vira nulo (o registro continua).
do $$
declare lic uuid := (select id from ids where nome = 'lic'); isl uuid := (select id from ids where nome = 'propria');
begin
  update intervencoes_sem_licenca set licenca_id = lic where id = isl;
  perform pg_temp.assert((select licenca_id from intervencoes_sem_licenca where id = isl) = lic, 'vínculo com a licença não gravou');
end $$;

-- Permissões: licenciador grava; CISP não grava.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000e2', true);
do $$
declare sec uuid := (select id from ids where nome = 'sec');
begin
  insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, logradouro, inicio_lat, inicio_lng)
  values ('telecom', array['vala'], 'obra','pelo licenciador',sec,'propria_orgao','R',-22.90,-43.11);
  perform pg_temp.assert((select count(*) from intervencoes_sem_licenca where escopo = 'pelo licenciador') = 1,
    'licenciador não gravou');
end $$;

select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000e3', true);
do $$
declare sec uuid := (select id from ids where nome = 'sec');
begin
  perform pg_temp.recusa(format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, logradouro, inicio_lat, inicio_lng)
    values ('telecom', array['vala'], 'obra','pela CISP','%s','propria_orgao','R',-22.90,-43.11)$q$, sec),
    'row-level security', 'CISP gravou sem permissão');
  perform pg_temp.assert((select count(*) from intervencoes_sem_licenca) >= 1, 'CISP não consegue ler');
end $$;

-- Anônimo não lê nada.
set local role anon;
do $$
begin
  perform pg_temp.recusa('select count(*) from intervencoes_sem_licenca', 'permission denied', 'anônimo leu a tabela');
end $$;
reset role;
set local role cadex_test_app;

-- Auditoria registrou as inclusões (lida como dono: só administrador lê a auditoria).
reset role;
do $$
begin
  perform pg_temp.assert((select count(*) from auditoria where tabela = 'intervencoes_sem_licenca' and operacao = 'INSERT') >= 4,
    'auditoria não registrou as inclusões');
end $$;

-- O que já existia não mudou: licenças e consulta pública.
do $$
begin
  perform pg_temp.assert((select count(*) from licencas) = (select v from ref where k = 'licencas'), 'o número de licenças mudou');
  perform pg_temp.assert(jsonb_array_length(public.obras_publicas()) = (select v from ref where k = 'publicas'),
    'a consulta pública mudou por causa do registro sem licença');
end $$;

rollback;
