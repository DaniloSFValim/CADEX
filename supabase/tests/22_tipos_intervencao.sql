-- =====================================================================
-- Catálogo de tipos por setor: leitura, permissões, imutabilidade,
-- "outros" fixo, telecom fechado no art. 10, uso em licenças e em obras
-- sem licença, e auditoria.
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

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant anon to cadex_test_app;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'gestor.tip@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000f2', 'admin.tip@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000f1', 'Gestor', 'gestor', false),
  ('00000000-0000-4000-8000-0000000000f2', 'Admin', 'gestor', true);

create temp table ids (nome text primary key, id uuid);
grant select, insert on ids to public;
insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
values ('Secretaria de Mobilidade TIP', 'SEMOBI-T', 'municipal', 'administracao_direta', '{}');
insert into ids select 'org', id from orgaos_publicos where sigla = 'SEMOBI-T';

-- 1. Carga inicial (como dono da tabela).
do $$
begin
  perform pg_temp.assert((select count(*) from tipos_intervencao where setor = 'telecom') = 9,
    'telecom deveria ter exatamente os 9 tipos do art. 10');
  perform pg_temp.assert(not exists (select 1 from tipos_intervencao where setor = 'telecom' and codigo = 'outros'),
    'telecom não pode ter "outros"');
  perform pg_temp.assert(exists (select 1 from tipos_intervencao where setor = 'viario' and codigo = 'bicicletario' and ativo),
    'bicicletário deveria existir em viário e estar ativo');
  perform pg_temp.assert((select count(*) from tipos_intervencao where codigo = 'outros') = 5,
    '"outros" deveria existir em cada setor que não é telecom');
end $$;

-- 2. Anônimo: só lê tipos ativos (a placa e o mapa usam o rótulo).
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '', true);
  perform pg_temp.assert((select count(*) from tipos_intervencao where not ativo) = 0,
    'anônimo leu tipo desativado');
  reset role;
end $$;

-- 3. Gestor: lê, mas não inclui nem altera o catálogo.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f1', true);
  perform pg_temp.recusa(
    $q$insert into tipos_intervencao (setor, codigo, rotulo, fonte) values ('viario', 'teste_gestor', 'Teste', 'Ato de teste')$q$,
    'row-level security', 'gestor incluiu tipo');
  update tipos_intervencao set rotulo = 'Alterado pelo gestor' where codigo = 'bicicletario';
  reset role;
  perform pg_temp.assert((select rotulo from tipos_intervencao where codigo = 'bicicletario' and setor = 'viario') = 'Bicicletário',
    'gestor alterou o catálogo');
end $$;

-- 4. Administrador: inclui, renomeia e desativa; as regras valem para ele também.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f2', true);

  insert into tipos_intervencao (setor, codigo, rotulo, fonte)
  values ('viario', 'sinalizacao_teste', 'Sinalização de teste', 'Ato de teste nº 1/2026');

  perform pg_temp.recusa(
    $q$insert into tipos_intervencao (setor, codigo, rotulo, fonte) values ('telecom', 'novo_tel', 'Novo', 'Ato de teste')$q$,
    'row-level security', 'admin incluiu tipo em telecom');

  perform pg_temp.recusa(
    $q$update tipos_intervencao set codigo = 'outro_codigo' where codigo = 'sinalizacao_teste'$q$,
    'não mudam', 'código mudou');

  perform pg_temp.recusa(
    $q$update tipos_intervencao set ativo = false where setor = 'telecom' and codigo = 'vala'$q$,
    'art. 10', 'telecom foi desativado pela tela');

  perform pg_temp.recusa(
    $q$update tipos_intervencao set ativo = false where setor = 'viario' and codigo = 'outros'$q$,
    'tipos_outros_sempre_ativo', '"outros" foi desativado');

  update tipos_intervencao set rotulo = 'Sinalização renomeada' where codigo = 'sinalizacao_teste';
  update tipos_intervencao set ativo = false where codigo = 'sinalizacao_teste';
  reset role;

  perform pg_temp.assert((select rotulo from tipos_intervencao where codigo = 'sinalizacao_teste') = 'Sinalização renomeada',
    'rótulo não foi alterado');
  perform pg_temp.assert((select ativo from tipos_intervencao where codigo = 'sinalizacao_teste') = false,
    'tipo não foi desativado');
end $$;

-- 5. Obra sem licença: tipos do setor, "outros" com descrição, tipo desativado.
do $$
declare
  org uuid := (select id from ids where nome = 'org');
  a uuid;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f1', true);

  insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    logradouro, inicio_lat, inicio_lng)
  values ('viario', array['bicicletario'], 'servico', 'Instalação de bicicletários', org, 'propria_orgao',
    'Rua Visconde do Rio Branco', -22.8955, -43.1245)
  returning id into a;
  insert into ids values ('bicicletario_isl', a);

  perform pg_temp.recusa(
    format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng)
      values ('viario', array['outros'], 'servico', 'x', '%s', 'propria_orgao', 'R', -22.90, -43.11)$q$, org),
    'Descreva', '"outros" foi aceito sem descrição');

  perform pg_temp.recusa(
    format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng)
      values ('gas', array['bicicletario'], 'servico', 'x', '%s', 'propria_orgao', 'R', -22.90, -43.11)$q$, org),
    'não está disponível', 'tipo de viário aceito em gás');

  perform pg_temp.recusa(
    format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng)
      values ('viario', array['outros'], 'servico', 'x', '%s', 'propria_orgao', 'R', -22.90, -43.11)$q$, org),
    'Descreva', 'outros sem descrição aceito');
  reset role;
end $$;

-- Desativa bicicletário como administrador: registro antigo continua válido,
-- registro novo não aceita o tipo.
do $$
declare a uuid := (select id from ids where nome = 'bicicletario_isl'); org uuid := (select id from ids where nome = 'org');
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f2', true);
  update tipos_intervencao set ativo = false where setor = 'viario' and codigo = 'bicicletario';
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f1', true);

  update intervencoes_sem_licenca set escopo = 'Bicicletários, trecho 2' where id = a;
  perform pg_temp.assert((select escopo from intervencoes_sem_licenca where id = a) = 'Bicicletários, trecho 2',
    'registro antigo não pôde ser corrigido após o tipo ser desativado');

  perform pg_temp.recusa(
    format($q$insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id,
      executora_modo, logradouro, inicio_lat, inicio_lng)
      values ('viario', array['bicicletario'], 'servico', 'novo', '%s', 'propria_orgao', 'R', -22.90, -43.11)$q$, org),
    'não está disponível', 'tipo desativado aceito em registro novo');
  reset role;
end $$;

-- 6. Licença: o mesmo catálogo. Telecom não aceita "outros".
do $$
declare op uuid;
begin
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras)
  values ('12345678000195', 'Operadora TIP S.A.', 'operadora', 'op@tip.test', '{telecom}', true) returning id into op;

  alter table licencas disable trigger licencas_antes_de_gravar;
  perform pg_temp.recusa(
    format($q$insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data,
      situacao, decisao_data, inicio_previsto, fim_previsto)
      values ('telecom', 'LIC-TIP-OUTROS', array['outros'], 'x', '%s', '%s', '2026-09-10', 'deferida', '2026-09-15',
      '2026-10-01', '2026-10-30')$q$, op, op),
    'não está disponível', 'licença de telecom aceitou "outros"');
  insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data,
                        situacao, decisao_data, inicio_previsto, fim_previsto)
  values ('telecom', 'LIC-TIP-OK', array['vala'], 'x', op, op, '2026-09-10', 'deferida', '2026-09-15',
          '2026-10-01', '2026-10-30');
  alter table licencas enable trigger licencas_antes_de_gravar;
end $$;

-- 7. Auditoria: as mudanças do catálogo ficaram registradas (como dono).
do $$
begin
  perform pg_temp.assert((select count(*) from auditoria
                          where tabela = 'tipos_intervencao'
                            and por = '00000000-0000-4000-8000-0000000000f2') >= 3,
    'auditoria não registrou as alterações do administrador no catálogo');
end $$;

rollback;
