-- =====================================================================
-- Comunicação de emergência (após o fato, até 72 h) e de serviço
-- programado (antes do início). Local obrigatório no mapa. A consulta
-- pública não expõe responsável nem protocolo do 153.
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
  when raise_exception or check_violation or not_null_violation then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

do $$
declare emp uuid; n int;
begin
  alter table empresas disable trigger user;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('33000167000101', 'Emergência CSP Ltda.', 'operadora', 'e@csp40.test', '{telecom}', true, 'deferida', true, 'CADEX-CSP-0040')
  returning id into emp;

  -- 1. Emergência válida, registrada 2 h depois do fato.
  insert into comunicacoes_servico (empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, ocorrido_em, protocolo_cisp, inicio_lat, inicio_lng, fim_lat, fim_lng)
  values (emp, 'emergencia', 'Rompimento de cabo', 'Plantão', array['ABC1234'], 'Rua A, 10', 'Reparo emergencial',
    current_date, current_date, now() - interval '2 hours', 'PROTO-1', -22.900000, -43.120000, -22.901000, -43.121000);
  select count(*) into n from comunicacoes_servico where empresa_id = emp and tipo = 'emergencia' and inicio_previsto = ((now() - interval '2 hours') at time zone 'America/Sao_Paulo')::date;
  perform pg_temp.assert(n = 1, 'emergência não ganhou a data do fato');

  -- 2. Emergência com mais de 72 h é recusada.
  perform pg_temp.recusa(format($f$insert into comunicacoes_servico (empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, ocorrido_em, inicio_lat, inicio_lng)
    values (%L, 'emergencia', 'Rompimento', 'Plantão', array['ABC1234'], 'Rua B', 'Reparo', current_date, current_date,
    now() - interval '73 hours', -22.9, -43.1)$f$, emp), '72 horas', 'emergência antiga foi aceita');

  -- 3. Fato no futuro é recusado.
  perform pg_temp.recusa(format($f$insert into comunicacoes_servico (empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, ocorrido_em, inicio_lat, inicio_lng)
    values (%L, 'emergencia', 'Rompimento', 'Plantão', array['ABC1234'], 'Rua C', 'Reparo', current_date, current_date,
    now() + interval '1 hour', -22.9, -43.1)$f$, emp), 'futuro', 'fato futuro foi aceito');

  -- 4. Programado sem local no mapa é recusado.
  perform pg_temp.recusa(format($f$insert into comunicacoes_servico (empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto)
    values (%L, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua D', 'Manutenção', current_date + 3, current_date + 3)$f$, emp),
    'mapa', 'programado sem local foi aceito');

  -- 5. Programado registrado depois do início é recusado.
  perform pg_temp.recusa(format($f$insert into comunicacoes_servico (empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, comunicado_em, inicio_lat, inicio_lng)
    values (%L, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua E', 'Manutenção', hoje_niteroi() - 1, hoje_niteroi(),
    now(), -22.9, -43.1)$f$, emp), 'antes do início', 'programado tardio foi aceito');

  -- 6. Tipo e data do fato não mudam depois do registro.
  perform pg_temp.recusa(format($f$update comunicacoes_servico set tipo = 'programado' where empresa_id = %L and tipo = 'emergencia'$f$, emp),
    'não podem ser alterados', 'tipo do fato foi alterado');

  -- 7. A consulta pública não traz responsável nem protocolo do 153.
  perform pg_temp.assert(not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comunicacoes_publicas'
      and column_name in ('responsavel', 'protocolo_cisp', 'registrado_por')),
    'consulta pública expõe dados internos');
  perform pg_temp.assert(exists (select 1 from comunicacoes_publicas where tipo = 'emergencia' and razao_social = 'Emergência CSP Ltda.'),
    'emergência não aparece na consulta pública');
end $$;

rollback;
