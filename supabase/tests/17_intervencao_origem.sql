-- =====================================================================
-- Tipo de intervenção (obra/serviço), origem institucional e obra pública
-- contratada por Prefeitura ou autarquia, com empreiteira executora.
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
  when raise_exception or check_violation or unique_violation or insufficient_privilege then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d1', 'gestor.interv@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-0000000000d1', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000d1', true);

do $$
declare
  op uuid; emp uuid; pref uuid; aut uuid; est uuid; lic uuid; pub jsonb;
  trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua Mem de Sá', 'inicio_lat', -22.905, 'inicio_lng', -43.11));
  base text := $q$'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'$q$;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, setores, executa_obras)
  values ('12345678000195', 'Operadora Interv S.A.', 'OpInterv', 'operadora', 'i1@i.test', '{telecom}', true) returning id into op;
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, setores)
  values ('11222333000181', 'Empreiteira Viária Ltda.', 'Empreiteira', 'terceirizada', 'i2@i.test', '{viario,drenagem}') returning id into emp;

  insert into orgaos_publicos (nome, sigla, esfera, setores) values ('Secretaria de Obras', 'SMO', 'municipal', '{}') returning id into pref;
  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores) values ('Autarquia de Obras', 'AUTOB', 'municipal', 'autarquia', '{}') returning id into aut;
  insert into orgaos_publicos (nome, sigla, esfera, setores) values ('Governo do Estado', 'GERJ', 'estadual', '{}') returning id into est;

  -- 1. Concessionária (fluxo antigo) segue igual; tipo e origem têm padrão.
  lic := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000701/2026','numero','701/2026',
    'tipos_obra',array['vala'],'escopo','Vala','executora_id',op,'contratante_id',op,
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  perform pg_temp.assert((select tipo_intervencao = 'obra' and origem_intervencao = 'concessionaria' from licencas where id = lic),
    'padrão de tipo e origem não é obra/concessionária');

  -- 2. Serviço de concessionária executado pela própria concessionária.
  lic := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000702/2026','numero','702/2026',
    'tipo_intervencao','servico','tipos_obra',array['rede'],'escopo','Manutenção de rede','executora_id',op,
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  perform pg_temp.assert((select tipo_intervencao = 'servico' from licencas where id = lic), 'serviço não gravou');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','X-1','tipo_intervencao','reforma',
    'tipos_obra',array['vala'],'escopo','x','executora_id','%s','protocolo_data','2026-09-10'), '[]'::jsonb)$q$, op),
    'tipo_intervencao', 'tipo de intervenção inválido foi aceito');

  -- 3. Obra pública da Prefeitura executada por empreiteira.
  lic := public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000703/2026','numero','703/2026',
    'tipo_intervencao','obra','origem_intervencao','municipio','tipos_obra',array['recomposicao'],'escopo','Pavimentação da Rua A',
    'executora_id',emp,'orgao_contratante_id',pref,'contrato_numero','CT 12/2026','processo_administrativo','PA 999/2026',
    'ordem_servico_numero','OS 5','objeto_contrato','Pavimentação',
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  perform pg_temp.assert((select origem_intervencao = 'municipio' and contrato_numero = 'CT 12/2026' and orgao_contratante_id = pref
                            and executora_id = emp from licencas where id = lic), 'obra municipal não gravou os campos');

  -- 4. Serviço público contratado por autarquia.
  lic := public.salvar_licenca(jsonb_build_object('setor','drenagem','processo_sei','NIT-050120/000704/2026','numero','704/2026',
    'tipo_intervencao','servico','origem_intervencao','autarquia','tipos_obra',array['galeria_drenagem'],'escopo','Limpeza de galeria',
    'executora_id',emp,'orgao_contratante_id',aut,'imovel_endereco','Rua B','processo_urbanismo','URB-1',
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  perform pg_temp.assert((select origem_intervencao = 'autarquia' from licencas where id = lic), 'serviço de autarquia não gravou');

  -- 5. Origem e órgão têm de combinar.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000705/2026',
    'tipos_obra',array['recomposicao'],'escopo','x','executora_id','%s','orgao_contratante_id','%s','origem_intervencao','autarquia',%s), %L::jsonb)$q$,
    emp, pref, base, trecho::text), 'exige uma autarquia', 'autarquia com órgão da administração direta foi aceita');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000706/2026',
    'tipos_obra',array['recomposicao'],'escopo','x','executora_id','%s','orgao_contratante_id','%s','origem_intervencao','municipio',%s), %L::jsonb)$q$,
    emp, aut, base, trecho::text), 'administração direta', 'prefeitura com autarquia foi aceita');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000707/2026',
    'tipos_obra',array['recomposicao'],'escopo','x','executora_id','%s','orgao_contratante_id','%s','origem_intervencao','concessionaria',%s), %L::jsonb)$q$,
    emp, pref, base, trecho::text), 'não tem órgão público', 'concessionária com órgão público foi aceita');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000708/2026',
    'tipos_obra',array['recomposicao'],'escopo','x','executora_id','%s','origem_intervencao','municipio',%s), %L::jsonb)$q$,
    emp, base, trecho::text), 'informe a contratante', 'obra pública sem órgão foi aceita');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000709/2026',
    'tipos_obra',array['recomposicao'],'escopo','x','executora_id','%s','orgao_contratante_id','%s','origem_intervencao','outro_ente',%s), %L::jsonb)$q$,
    emp, pref, base, trecho::text), 'estadual ou federal', 'órgão municipal como "outro ente" foi aceito');
  -- Órgão estadual como contratante continua possível.
  perform public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000710/2026','numero','710/2026',
    'tipos_obra',array['recomposicao'],'escopo','Obra estadual','executora_id',emp,'orgao_contratante_id',est,'origem_intervencao','outro_ente',
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);

  -- 6. Prefeitura executando por conta própria não existe como executora: a executora é sempre empresa.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','viario','processo_sei','NIT-050120/000711/2026',
    'tipos_obra',array['recomposicao'],'escopo','x','orgao_contratante_id','%s','origem_intervencao','municipio',%s), %L::jsonb)$q$,
    pref, base, trecho::text), null, 'licença sem executora foi aceita');

  -- 7. Mapa e dados abertos informam tipo e origem; contrato não vai a público.
  pub := public.obras_publicas();
  perform pg_temp.assert(jsonb_array_length(pub) = 5, 'obras_publicas deveria ter 5 licenças deferidas, tem ' || jsonb_array_length(pub));
  perform pg_temp.assert((select count(*) from jsonb_array_elements(pub) e where e->>'origem' = 'municipio' and e->>'tipo_intervencao' = 'obra'
                            and e->>'contratante' = 'SMO' and e->>'executora' = 'Empreiteira') = 1, 'obra municipal sem tipo/origem/contratante públicos');
  perform pg_temp.assert((select count(*) from jsonb_array_elements(pub) e where e->>'tipo_intervencao' = 'servico') = 2, 'serviços não aparecem como serviço');
  perform pg_temp.assert(pub::text not like '%CT 12/2026%' and pub::text not like '%PA 999/2026%', 'dado contratual vazou na lista pública');
  perform pg_temp.assert((select count(*) from jsonb_array_elements(public.obras_geojson()->'features') f where f->'properties'->>'origem' = 'autarquia') = 1,
    'geojson sem origem');
  perform pg_temp.assert((public.licenca_publica((select codigo_publico from licencas where numero = '703/2026'))->>'tipo_intervencao') = 'obra'
                         and (public.licenca_publica((select codigo_publico from licencas where numero = '703/2026'))->>'origem') = 'municipio',
    'licenca_publica sem tipo/origem');
  perform pg_temp.assert(public.licenca_publica((select codigo_publico from licencas where numero = '703/2026'))::text not like '%CT 12/2026%',
    'dado contratual vazou na página pública');

  -- 7b. Mudar a localização de um trecho aparece no mapa e no dado aberto; apagar a licença tira das duas listas.
  update licenca_trechos set inicio_lat = -22.9, inicio_lng = -43.12
   where licenca_id = (select id from licencas where numero = '701/2026');
  perform pg_temp.assert((select count(*) from jsonb_array_elements(public.obras_publicas()) e
                           where e->>'numero' = '701/2026' and (e->'trechos'->0->'inicio') = '[-43.120000, -22.900000]'::jsonb) = 1,
    'obras_publicas não refletiu a nova localização');
  perform pg_temp.assert((select count(*) from jsonb_array_elements(public.obras_geojson()->'features') f
                           where f->'properties'->>'numero' = '701/2026'
                             and f->'geometry'->'coordinates' = '[-43.120000, -22.900000]'::jsonb) = 1,
    'obras_geojson não refletiu a nova localização');

  -- 8. Trocar a origem de um registro existente também passa pela regra.
  perform pg_temp.recusa(format('update licencas set origem_intervencao = %L where numero = %L', 'autarquia', '703/2026'),
    'exige uma autarquia', 'troca para origem incompatível foi aceita');
  -- E editar outros campos de um registro já classificado não é travado.
  update licencas set observacoes = 'ajuste' where numero = '703/2026';
end $$;

rollback;
