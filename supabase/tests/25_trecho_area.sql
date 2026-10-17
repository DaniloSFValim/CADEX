-- =====================================================================
-- Área da intervenção: polígono válido dentro de Niterói, ou nulo.
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
  when check_violation or invalid_parameter_value then
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

alter table empresas disable trigger user;
insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
values ('12345678000195', 'Área Ltda.', 'terceirizada', 'a@area.test', '{viario}', false, 'deferida', true, 'CADEX-ARE-0001');
alter table empresas enable trigger user;

alter table licencas disable trigger user;
insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_razao_social, imovel_endereco,
                      protocolo_data, situacao, decisao_data, inicio_previsto, fim_previsto)
select 'drenagem', 'PROC-ARE-1', array['vala'], 'Obra com área', e.id, 'Prefeitura Municipal de Niterói', 'Rua Teste, 1',
       '2026-09-10', 'em_analise', null, '2026-10-01', '2026-12-31'
  from empresas e where e.codigo_cadex = 'CADEX-ARE-0001';
insert into licenca_trechos (licenca_id, ordem, logradouro, inicio_lat, inicio_lng, fim_lat, fim_lng)
select id, 1, 'Rua Teste', -22.90, -43.10, null, null from licencas where processo_sei = 'PROC-ARE-1';
alter table licencas enable trigger user;

do $$
declare
  v_trecho uuid := (select t.id from licenca_trechos t join licencas l on l.id = t.licenca_id where l.processo_sei = 'PROC-ARE-1');
begin
  -- Polígono válido dentro da faixa de Niterói: aceito.
  update licenca_trechos set area = ST_SetSRID(ST_GeomFromText(
    'POLYGON((-43.105 -22.905, -43.100 -22.905, -43.100 -22.900, -43.105 -22.900, -43.105 -22.905))'), 4326)
  where id = v_trecho;
  if (select geometrytype(area) from licenca_trechos where id = v_trecho) <> 'POLYGON' then
    raise exception 'ASSERT FALHOU: polígono válido não foi gravado';
  end if;
end $$;

-- Fora da faixa: recusado.
select pg_temp.recusa(
  $sql$update licenca_trechos set area = ST_SetSRID(ST_GeomFromText('POLYGON((-44.0 -22.9, -43.9 -22.9, -43.9 -22.8, -44.0 -22.9))'), 4326)
       where logradouro = 'Rua Teste'$sql$,
  'licenca_trechos_area_niteroi', 'área fora de Niterói foi aceita');

-- Polígono que se cruza (inválido): recusado.
select pg_temp.recusa(
  $sql$update licenca_trechos set area = ST_SetSRID(ST_GeomFromText('POLYGON((-43.105 -22.905, -43.100 -22.900, -43.105 -22.900, -43.100 -22.905, -43.105 -22.905))'), 4326)
       where logradouro = 'Rua Teste'$sql$,
  'licenca_trechos_area_niteroi', 'polígono inválido foi aceito');

-- Ponto no lugar de polígono: recusado pelo tipo da coluna.
select pg_temp.recusa(
  $sql$update licenca_trechos set area = ST_SetSRID(ST_MakePoint(-43.10, -22.90), 4326) where logradouro = 'Rua Teste'$sql$,
  null, 'ponto foi aceito no lugar de polígono');

-- O mapa público recebe a área em GeoJSON, só para licença deferida ou cancelada.
-- A regra de negócio (licencas_antes_de_gravar) fica de fora, por ser fixture.
update licenca_trechos set area = ST_SetSRID(ST_GeomFromText(
    'POLYGON((-43.105 -22.905, -43.100 -22.905, -43.100 -22.900, -43.105 -22.900, -43.105 -22.905))'), 4326)
  where logradouro = 'Rua Teste';
alter table licencas disable trigger licencas_antes_de_gravar;
update licencas set situacao = 'deferida' where processo_sei = 'PROC-ARE-1';
alter table licencas enable trigger licencas_antes_de_gravar;

do $$
declare
  trecho jsonb;
begin
  select t into trecho
    from jsonb_array_elements(public.obras_publicas()) o, jsonb_array_elements(o -> 'trechos') t
   where t ->> 'logradouro' = 'Rua Teste' limit 1;
  perform pg_temp.assert(trecho is not null, 'trecho não apareceu no mapa público');
  perform pg_temp.assert(trecho -> 'area' ->> 'type' = 'Polygon', 'área não foi para o mapa público');
  perform pg_temp.assert(jsonb_array_length(trecho -> 'area' -> 'coordinates' -> 0) = 5,
    'anel da área sem o ponto de fechamento');
end $$;

-- Nulo é aceito (trecho sem área): o mapa recebe null, não quebra.
update licenca_trechos set area = null where logradouro = 'Rua Teste';
do $$
begin
  perform pg_temp.assert((select t -> 'area' from jsonb_array_elements(public.obras_publicas()) o, jsonb_array_elements(o -> 'trechos') t
                           where t ->> 'logradouro' = 'Rua Teste' limit 1) = 'null'::jsonb,
    'trecho sem área devolveu algo no mapa público');
end $$;
select 'área da intervenção: OK' as resultado;

rollback;
