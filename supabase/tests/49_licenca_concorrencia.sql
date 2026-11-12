-- =====================================================================
-- Concorrência na edição de licença: salvar com a versão atual passa;
-- com versão antiga é recusado; sem o campo, segue como antes.
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
  op uuid; lic uuid; v0 timestamptz; v1 timestamptz;
  trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua Concorrente', 'bairro', 'Centro', 'inicio_lat', -22.9, 'inicio_lng', -43.1));
  base jsonb;
  recusou boolean := false;
  msg text;
begin
  alter table empresas disable trigger empresas_situacao;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('11222333000181', 'Operadora Concorrente S.A.', 'operadora', 'c@t49.test', '{telecom}', true, 'deferida', true, 'CADEX-T49-OP')
  returning id into op;
  alter table empresas enable trigger empresas_situacao;

  base := jsonb_build_object('setor', 'telecom', 'processo_sei', 'NIT-050120/000490/2026', 'numero', '490/2026',
    'tipo_intervencao', 'obra', 'tipos_obra', array['vala'], 'escopo', 'Concorrência', 'executora_id', op,
    'protocolo_data', '2026-09-15', 'situacao', 'deferida', 'inicio_previsto', '2026-10-01', 'fim_previsto', '2026-10-30');
  lic := public.salvar_licenca(base, trecho);
  select atualizado_em into v0 from licencas where id = lic;

  -- Quem abriu a licença salva a partir da versão atual: passa.
  perform public.salvar_licenca(base || jsonb_build_object('id', lic, 'escopo', 'Primeira alteração', 'atualizado_em_esperado', (select atualizado_em from licencas where id = lic)),
    (select jsonb_agg(jsonb_build_object('id', t.id, 'logradouro', t.logradouro, 'bairro', t.bairro,
              'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng)) from licenca_trechos t where t.licenca_id = lic));
  -- Dentro de uma transação o now() é o mesmo; a versão antiga é simulada com um segundo a menos.
  v0 := v0 - interval '1 second';
  select atualizado_em into v1 from licencas where id = lic;

  -- Outra pessoa, com a versão antiga v0, tenta salvar por cima: é recusado.
  begin
    perform public.salvar_licenca(base || jsonb_build_object('id', lic, 'escopo', 'Sobrescrita antiga', 'atualizado_em_esperado', v0),
      (select jsonb_agg(jsonb_build_object('id', t.id, 'logradouro', t.logradouro, 'bairro', t.bairro,
                'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng)) from licenca_trechos t where t.licenca_id = lic));
  exception when others then
    msg := sqlerrm;
    recusou := msg like '%alterada por outra pessoa%';
  end;
  perform pg_temp.assert(recusou, 'versão antiga foi aceita e sobrescreveu a alteração');
  perform pg_temp.assert((select escopo from licencas where id = lic) = 'Primeira alteração',
    'a recusa não deveria ter gravado nada');

  -- Com a versão atual, a gravação volta a passar.
  perform public.salvar_licenca(base || jsonb_build_object('id', lic, 'escopo', 'Segunda alteração', 'atualizado_em_esperado', v1),
    (select jsonb_agg(jsonb_build_object('id', t.id, 'logradouro', t.logradouro, 'bairro', t.bairro,
              'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng)) from licenca_trechos t where t.licenca_id = lic));
  perform pg_temp.assert((select escopo from licencas where id = lic) = 'Segunda alteração',
    'a gravação com a versão atual não foi aceita');

  -- Sem o campo (quem ainda não envia a versão), segue como antes.
  perform public.salvar_licenca(base || jsonb_build_object('id', lic, 'escopo', 'Sem versão'),
    (select jsonb_agg(jsonb_build_object('id', t.id, 'logradouro', t.logradouro, 'bairro', t.bairro,
              'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng)) from licenca_trechos t where t.licenca_id = lic));
  perform pg_temp.assert((select escopo from licencas where id = lic) = 'Sem versão',
    'gravação sem versão deveria continuar aceita');
end $$;

rollback;
