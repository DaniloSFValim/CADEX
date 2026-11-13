-- =====================================================================
-- Obra ou serviço sem licença com vários segmentos: a coluna aceita uma
-- MultiLineString dentro de Niterói, recusa ponto fora da faixa e o mapa
-- público devolve o traçado.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

do $$
declare
  org uuid;
  j record;
begin
  alter table intervencoes_sem_licenca disable trigger user;

  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Secretaria T53', 'ST53', 'municipal', 'administracao_direta', '{}') returning id into org;

  insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    logradouro, tipos_obra, inicio_lat, inicio_lng, fim_lat, fim_lng, inicio_previsto, fim_previsto, situacao, publica,
    segmentos)
  values ('viario', 'obra', 'Segmentos T53', org, 'propria_orgao',
    'Rua T53', '{vala}', -22.9, -43.1, -22.901, -43.101, current_date - 1, current_date + 3, 'em_execucao', true,
    ST_SetSRID(ST_GeomFromText('MULTILINESTRING((-43.1 -22.9, -43.105 -22.905, -43.11 -22.91),(-43.12 -22.92, -43.125 -22.925))'), 4326));

  select * into j from intervencoes_publicas where escopo = 'Segmentos T53';
  perform pg_temp.assert(j.segmentos is not null, 'o mapa público deveria trazer o traçado');
  perform pg_temp.assert(ST_NumGeometries(j.segmentos) = 2, 'o traçado deveria ter dois segmentos');
  perform pg_temp.assert(ST_NPoints(j.segmentos) = 5, 'o traçado deveria ter os cinco pontos');

  -- Fora da faixa de Niterói: recusado pela checagem da coluna.
  begin
    insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
      logradouro, tipos_obra, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao, publica, segmentos)
    values ('viario', 'obra', 'Fora T53', org, 'propria_orgao',
      'Rua fora', '{vala}', -22.9, -43.1, current_date, current_date + 1, 'em_execucao', true,
      ST_SetSRID(ST_GeomFromText('MULTILINESTRING((-44.0 -22.9, -44.01 -22.91))'), 4326));
    raise exception 'ASSERT FALHOU: traçado fora de Niterói foi aceito';
  exception when check_violation then null;
  end;
end $$;

rollback;
