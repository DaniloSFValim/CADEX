-- =====================================================================
-- Obra sem licença: área opcional, polígono válido dentro de Niterói.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create or replace function pg_temp.recusa(p_sql text, p_msg text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FALHOU: %', p_msg;
exception
  when check_violation or invalid_parameter_value then null;
end;
$$;

insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
values ('Secretaria de Teste Área', 'STA', 'municipal', 'administracao_direta', '{}');

insert into intervencoes_sem_licenca (setor, tipos_obra, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, logradouro,
  inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao)
select 'viario', array['vala'], 'servico', 'Poda na praça', o.id, 'propria_orgao', 'Praça Teste',
  -22.90, -43.10, '2026-10-05', '2026-10-20', 'em_execucao'
  from orgaos_publicos o where o.sigla = 'STA';

do $$
begin
  perform pg_temp.assert((select area is null from intervencoes_sem_licenca where logradouro = 'Praça Teste'),
    'obra sem área deveria ficar sem área');
  update intervencoes_sem_licenca set area = ST_SetSRID(ST_GeomFromText(
    'POLYGON((-43.105 -22.905, -43.100 -22.905, -43.100 -22.900, -43.105 -22.900, -43.105 -22.905))'), 4326)
  where logradouro = 'Praça Teste';
  perform pg_temp.assert((select geometrytype(area) from intervencoes_sem_licenca where logradouro = 'Praça Teste') = 'POLYGON',
    'polígono válido não foi gravado');
end $$;

select pg_temp.recusa(
  $sql$update intervencoes_sem_licenca set area = ST_SetSRID(ST_GeomFromText('POLYGON((-44.0 -22.9, -43.9 -22.9, -43.9 -22.8, -44.0 -22.9))'), 4326)
       where logradouro = 'Praça Teste'$sql$,
  'área fora de Niterói foi aceita');

select pg_temp.recusa(
  $sql$update intervencoes_sem_licenca set area = ST_SetSRID(ST_GeomFromText('POLYGON((-43.105 -22.905, -43.100 -22.900, -43.105 -22.900, -43.100 -22.905, -43.105 -22.905))'), 4326)
       where logradouro = 'Praça Teste'$sql$,
  'polígono inválido foi aceito');

select 'área sem licença: OK' as resultado;

rollback;
