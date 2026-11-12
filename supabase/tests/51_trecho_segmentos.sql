-- =====================================================================
-- Trecho com vários segmentos: gravação, leitura no mapa público, dados
-- abertos e página da licença. Segmento fora de Niterói é recusado.
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
  emp uuid;
  lic uuid;
  codigo text;
  j jsonb;
  n int;
begin
  alter table empresas disable trigger user;
  alter table licencas disable trigger licencas_antes_de_gravar;

  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('22333444000181', 'Empresa Segmentos T51 Ltda.', 'operadora', 'seg@t51.test', '{telecom}', true, 'deferida', true, 'CADEX-T51')
  returning id into emp;

  insert into licencas (setor, processo_sei, numero, tipos_obra, escopo, executora_id, protocolo_data, inicio_previsto, fim_previsto, situacao)
  values ('telecom', 'NIT-050120/000951/2026', '951/2026', '{vala}', 'Rua da Conceição', emp, current_date - 10, current_date - 5, current_date + 30, 'deferida')
  returning id, codigo_publico into lic, codigo;

  -- Dois lados da rua: duas linhas num único trecho.
  insert into licenca_trechos (licenca_id, ordem, logradouro, bairro, inicio_lat, inicio_lng, fim_lat, fim_lng, segmentos)
  values (lic, 1, 'Rua da Conceição', 'Centro', -22.8943, -43.1179, -22.8950, -43.1190,
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"MultiLineString","coordinates":[[[-43.1179,-22.8943],[-43.1190,-22.8950]],[[-43.1180,-22.8945],[-43.1191,-22.8952]]]}'), 4326));

  -- Mapa público: o trecho traz os segmentos.
  select o into j from jsonb_array_elements(public.obras_publicas()) o where o->>'codigo' = codigo;
  perform pg_temp.assert(j is not null, 'a licença deveria aparecer no mapa público');
  perform pg_temp.assert(jsonb_array_length(j->'trechos'->0->'segmentos'->'coordinates') = 2,
    'o mapa público deveria trazer os dois segmentos do trecho');

  -- Dados abertos: a geometria do trecho é a MultiLineString.
  select count(*) into n from jsonb_array_elements(public.obras_geojson()->'features') f
   where f->'properties'->>'codigo' = codigo and f->'geometry'->>'type' = 'MultiLineString';
  perform pg_temp.assert(n = 1, 'os dados abertos deveriam trazer a MultiLineString do trecho');

  -- Página da licença: também traz os segmentos.
  j := public.licenca_publica(codigo);
  perform pg_temp.assert(jsonb_array_length(j->'trechos'->0->'segmentos'->'coordinates') = 2,
    'a página da licença deveria trazer os dois segmentos');

  -- Segmento fora de Niterói é recusado pela checagem do banco.
  begin
    insert into licenca_trechos (licenca_id, ordem, logradouro, bairro, inicio_lat, inicio_lng, segmentos)
    values (lic, 2, 'Rua fora', 'Centro', -22.8943, -43.1179,
      ST_SetSRID(ST_GeomFromGeoJSON('{"type":"MultiLineString","coordinates":[[[-44.5,-22.9],[-44.6,-22.9]]]}'), 4326));
    raise exception 'ASSERT FALHOU: segmento fora de Niterói foi aceito';
  exception when check_violation then null;
  end;
end $$;

rollback;
