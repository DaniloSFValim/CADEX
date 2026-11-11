-- =====================================================================
-- Corrigir as datas de uma licença já concluída: mudar o início e a
-- conclusão no mesmo salvamento tem de funcionar. Antes, a função gravava
-- o início novo ainda com a conclusão antiga na linha, e o banco recusava
-- um conjunto de datas correto ("A conclusão não pode ser anterior ao
-- início da obra ou serviço").
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
  op uuid; lic uuid;
  trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua das Datas', 'bairro', 'Centro', 'inicio_lat', -22.9, 'inicio_lng', -43.1));
  base jsonb;
  recusou boolean := false;
begin
  alter table empresas disable trigger empresas_situacao;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('11222333000181', 'Operadora Datas S.A.', 'operadora', 'd@t47.test', '{telecom}', true, 'deferida', true, 'CADEX-T47-OP')
  returning id into op;
  alter table empresas enable trigger empresas_situacao;

  base := jsonb_build_object('setor', 'telecom', 'processo_sei', 'NIT-050120/000470/2024', 'numero', '470/2024',
    'tipo_intervencao', 'obra', 'tipos_obra', array['vala'], 'escopo', 'Datas lançadas erradas', 'executora_id', op,
    'protocolo_data', '2024-02-20', 'situacao', 'deferida');

  lic := public.salvar_licenca(base || jsonb_build_object(
    'inicio_previsto', '2024-03-01', 'fim_previsto', '2024-03-30', 'concluida_em', '2024-03-20'), trecho);

  -- Correção: a obra foi, na verdade, em junho. Início e conclusão mudam juntos.
  perform public.salvar_licenca(base || jsonb_build_object('id', lic,
    'inicio_previsto', '2024-06-01', 'fim_previsto', '2024-06-30', 'concluida_em', '2024-06-20'),
    (select jsonb_agg(jsonb_build_object('id', t.id, 'logradouro', t.logradouro, 'bairro', t.bairro,
              'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng)) from licenca_trechos t where t.licenca_id = lic));

  perform pg_temp.assert((select inicio_previsto = '2024-06-01' and concluida_em = '2024-06-20' from licencas where id = lic),
    'a correção conjunta de início e conclusão não foi gravada');

  -- Reabrir (tirar a conclusão) e mudar o início no mesmo salvamento também vale.
  perform public.salvar_licenca(base || jsonb_build_object('id', lic,
    'inicio_previsto', '2024-09-01', 'fim_previsto', '2024-09-30', 'concluida_em', null),
    (select jsonb_agg(jsonb_build_object('id', t.id, 'logradouro', t.logradouro, 'bairro', t.bairro,
              'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng)) from licenca_trechos t where t.licenca_id = lic));
  perform pg_temp.assert((select inicio_previsto = '2024-09-01' and concluida_em is null from licencas where id = lic),
    'reabrir a obra e mudar o início não foi gravado');

  -- A regra continua valendo: conclusão antes do início segue recusada.
  begin
    perform public.salvar_licenca(base || jsonb_build_object('id', lic,
      'inicio_previsto', '2024-09-01', 'fim_previsto', '2024-09-30', 'concluida_em', '2024-08-15'),
      (select jsonb_agg(jsonb_build_object('id', t.id, 'logradouro', t.logradouro, 'bairro', t.bairro,
                'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng)) from licenca_trechos t where t.licenca_id = lic));
  exception when others then
    recusou := sqlerrm like '%conclusão não pode ser anterior%';
  end;
  perform pg_temp.assert(recusou, 'conclusão anterior ao início deveria continuar recusada');
end $$;

rollback;
