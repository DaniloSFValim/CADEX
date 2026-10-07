-- =====================================================================
-- Outros setores: tipos e setores da empresa, código CADEX, documentos
-- por perfil, vínculos e licenças fora de telecom (sem as regras da
-- Resolução, que é só de telecom).
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

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000081', 'gestor.setores@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-000000000081', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000081', true);

create temp table ids (nome text primary key, id uuid);

do $$
declare gas uuid; san uuid; con uuid; op uuid; terc_gas uuid; terc_multi uuid; terc_dren uuid; c text;
        trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua A', 'inicio_lat', -22.9, 'inicio_lng', -43.1));
begin
  -- Tipos, setores e código CADEX
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, setores)
  values ('12345678000195', 'Concessionária de Gás S.A.', 'Naturgy', 'concessionaria', 'g@s.test', '{gas}')
  returning id, codigo_cadex into gas, c;
  perform pg_temp.assert(c like 'CADEX-GAS-%', 'código da concessionária de gás: ' || c);
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, setores)
  values ('11444777000161', 'Concessionária de Saneamento S.A.', 'Águas de Niterói', 'concessionaria', 's@s.test', '{saneamento}')
  returning id, codigo_cadex into san, c;
  perform pg_temp.assert(c like 'CADEX-SAN-%', 'código da concessionária de saneamento: ' || c);
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('11222333000181', 'Construtora Teste Ltda.', 'construtora', 'c@s.test') returning id, codigo_cadex into con, c;
  perform pg_temp.assert(c like 'CADEX-CON-%', 'código da construtora: ' || c);
  perform pg_temp.assert((select setores = '{construcao}' from empresas where id = con), 'construtora sem o setor construção');
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('55666777000181', 'Operadora Teste S.A.', 'operadora', 'o@s.test', '{gas}') returning id into op;
  perform pg_temp.assert((select setores = '{telecom}' from empresas where id = op), 'operadora fora de telecom');

  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('22333444000181', 'Terceirizada Gás Ltda.', 'terceirizada', 'tg@s.test', '{gas}') returning id into terc_gas;
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('66777888000181', 'Terceirizada Multissetor Ltda.', 'terceirizada', 'tm@s.test', '{telecom,gas,telecom}')
  returning id into terc_multi;
  perform pg_temp.assert((select setores = '{gas,telecom}' from empresas where id = terc_multi), 'setores repetidos');
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('77888999000181', 'Terceirizada Drenagem Ltda.', 'terceirizada', 'td@s.test', '{drenagem}') returning id into terc_dren;
  insert into ids values ('gas', gas), ('san', san), ('con', con), ('terc_gas', terc_gas), ('terc_multi', terc_multi), ('terc_dren', terc_dren);

  perform pg_temp.recusa($q$insert into empresas (cnpj, razao_social, tipo, email)
    values ('98765432000198', 'Sem setor', 'terceirizada', 'x@s.test')$q$, 'ao menos um setor', 'terceirizada sem setor');
  perform pg_temp.recusa($q$insert into empresas (cnpj, razao_social, tipo, email, setores)
    values ('98765432000198', 'Duas', 'concessionaria', 'x@s.test', '{gas,saneamento}')$q$,
    'gás ou saneamento', 'concessionária com dois setores');
  perform pg_temp.recusa($q$insert into empresas (cnpj, razao_social, tipo, email, setores)
    values ('98765432000198', 'Concessionária de drenagem', 'concessionaria', 'x@s.test', '{drenagem}')$q$,
    'gás ou saneamento', 'concessionária de drenagem');
  perform pg_temp.recusa(format($q$update empresas set setores = '{saneamento}' where id = %L$q$, gas),
    'setor da concessionária', 'concessionária trocou de setor');
  update empresas set setores = '{gas,saneamento,drenagem}' where id = terc_gas;
  update empresas set setores = '{gas}' where id = terc_gas;

  -- Documentos por perfil
  perform pg_temp.assert(
    (select count(*) from tipos_documento where 'telecom' = any(perfis)) = 12
    and (select count(*) from tipos_documento where 'gas' = any(perfis)) = 10
    and (select count(*) from tipos_documento where 'construtora' = any(perfis)) = 8
    and (select count(*) from tipos_documento where 'terceirizada' = any(perfis)) = 8
    and not exists (select 1 from tipos_documento where 'terceirizada' = any(perfis)
                     and codigo in ('DECL_REGULADOR', 'MAPA_INFRA', 'CONTRATO_COMPART'))
    and not exists (select 1 from tipos_documento where cardinality(perfis) > 0
                     and codigo in ('CRF_FGTS', 'CNDT', 'REL_EQUIPAMENTOS')),
    'documentos por perfil errados');
  perform pg_temp.assert(public.perfil_documental('concessionaria', '{saneamento}') = 'saneamento'
                         and public.perfil_documental('operadora', '{telecom}') = 'telecom'
                         and public.perfil_documental('construtora', '{construcao}') = 'construtora',
    'perfil documental errado');

  -- Vínculos: construtora e concessionária contratam terceirizadas
  insert into vinculos (contratante_id, contratada_id) values (con, terc_dren), (gas, terc_gas), (op, terc_multi);

  -- Licença de gás: sem APTA nem ART (Resolução é só telecom)
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'gas', 'processo_sei', 'GAS-1', 'numero', 'G-1', 'tipos_obra', array['vala', 'ligacao_predial'],
      'escopo', 'Ramal de gás', 'executora_id', terc_gas, 'contratante_id', gas,
      'protocolo_data', '2026-09-20', 'situacao', 'deferida', 'decisao_data', '2026-09-25',
      'inicio_previsto', '2026-10-01', 'fim_previsto', '2026-10-10'), trecho);

  -- Executora fora do setor
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'saneamento', 'processo_sei', 'SAN-1', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_id', %L, 'contratante_id', %L, 'protocolo_data', '2026-09-20'), %L::jsonb)$q$, terc_gas, san, trecho),
    'não atua no setor', 'executora de gás em licença de saneamento');
  -- Contratante de outro setor
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'gas', 'processo_sei', 'GAS-2', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_id', %L, 'contratante_id', %L, 'protocolo_data', '2026-09-20'), %L::jsonb)$q$, terc_gas, san, trecho),
    'contratante não atua', 'Águas de Niterói em licença de gás');
  -- Terceirizada não é contratante
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'gas', 'processo_sei', 'GAS-3', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_id', %L, 'contratante_id', %L, 'protocolo_data', '2026-09-20'), %L::jsonb)$q$, terc_gas, terc_multi, trecho),
    'operadora, concessionária ou construtora', 'terceirizada como contratante');

  -- Drenagem: construtora executa; dono do imóvel (pessoa física) sem cadastro
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-1', 'numero', 'D-1', 'tipos_obra', array['ligacao_predial', 'boca_de_lobo'],
      'escopo', 'Ligação da casa à rede pública', 'executora_id', con,
      'contratante_razao_social', 'Fulano de Tal', 'contratante_cpf', '529.982.247-25',
      'imovel_endereco', 'Rua A, 100', 'processo_urbanismo', 'URB-123/2026',
      'protocolo_data', '2026-09-20', 'situacao', 'deferida',
      'decisao_data', '2026-09-25', 'inicio_previsto', '2026-10-01', 'fim_previsto', '2026-10-05'), trecho);
  -- Drenagem: terceirizada contratada pela construtora
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-2', 'tipos_obra', array['galeria_drenagem', 'recomposicao'],
      'escopo', 'Galeria', 'executora_id', terc_dren, 'contratante_id', con,
      'imovel_endereco', 'Rua B, 20', 'processo_urbanismo', 'URB-124/2026', 'protocolo_data', '2026-09-20'), trecho);
  -- Drenagem: a própria construtora executa, sem contratante
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-3', 'tipos_obra', array['ligacao_predial'], 'escopo', 'Ligação do prédio',
      'executora_id', con, 'imovel_endereco', 'Rua C, 30', 'processo_urbanismo', 'URB-125/2026',
      'protocolo_data', '2026-09-20'), trecho);
  -- Drenagem: exigências
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-4', 'tipos_obra', array['ligacao_predial'], 'escopo', 'x',
      'executora_id', %L, 'contratante_id', %L, 'processo_urbanismo', 'URB-1', 'protocolo_data', '2026-09-20'), %L::jsonb)$q$,
      terc_dren, con, trecho), 'endereço do imóvel', 'drenagem sem endereço do imóvel');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-5', 'tipos_obra', array['ligacao_predial'], 'escopo', 'x',
      'executora_id', %L, 'contratante_id', %L, 'imovel_endereco', 'Rua D', 'protocolo_data', '2026-09-20'), %L::jsonb)$q$,
      terc_dren, con, trecho), 'Urbanismo', 'drenagem sem processo do Urbanismo');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-6', 'tipos_obra', array['ligacao_predial'], 'escopo', 'x',
      'executora_id', %L, 'contratante_razao_social', 'Beltrano', 'imovel_endereco', 'Rua D',
      'processo_urbanismo', 'URB-2', 'protocolo_data', '2026-09-20'), %L::jsonb)$q$,
      terc_dren, trecho), 'CPF ou o CNPJ', 'dono do imóvel sem CPF/CNPJ');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-7', 'tipos_obra', array['ligacao_predial'], 'escopo', 'x',
      'executora_id', %L, 'imovel_endereco', 'Rua D', 'processo_urbanismo', 'URB-3', 'protocolo_data', '2026-09-20'), %L::jsonb)$q$,
      terc_dren, trecho), 'dono do imóvel ou a construtora', 'terceirizada sem contratante na drenagem');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'drenagem', 'processo_sei', 'DRE-8', 'tipos_obra', array['ligacao_predial'], 'escopo', 'x',
      'executora_id', %L, 'contratante_razao_social', 'Beltrano', 'contratante_cpf', '11111111111',
      'imovel_endereco', 'Rua D', 'processo_urbanismo', 'URB-4', 'protocolo_data', '2026-09-20'), %L::jsonb)$q$,
      terc_dren, trecho), null, 'CPF inválido aceito');
  -- Contratante sem cadastro fora da drenagem
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'gas', 'processo_sei', 'GAS-4', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_id', %L, 'contratante_razao_social', 'Particular', 'protocolo_data', '2026-09-20'), %L::jsonb)$q$,
      terc_gas, trecho),
    'só é aceita em drenagem', 'contratante sem cadastro em licença de gás');

  -- Flexibilização: telecom defere mesmo com executora não APTA (sem ART).
  perform pg_temp.assert(public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'NIT-050120/000500/2026', 'numero', 'T-1', 'tipos_obra', array['rede'],
      'escopo', 'x', 'executora_id', terc_multi, 'contratante_id', op, 'protocolo_data', '2026-09-20',
      'situacao', 'deferida', 'decisao_data', '2026-09-25', 'inicio_previsto', '2026-10-01', 'fim_previsto', '2026-10-10'),
    trecho::jsonb) is not null, 'telecom deveria deferir sem exigir APTA nem ART');
end $$;

-- Público: setores na consulta e no mapa
select set_config('cadex.dre1', (select codigo_publico from licencas where numero = 'D-1'), true);
reset role;
set local role anon;
do $$
begin
  perform pg_temp.assert((select setores = '{gas,telecom}' from public.consulta_publica()
                           where razao_social = 'Terceirizada Multissetor Ltda.'), 'consulta pública sem setores');
  perform pg_temp.assert((select count(*) from jsonb_array_elements(public.obras_publicas()) o
                           where o ->> 'setor' in ('gas', 'drenagem')) = 2, 'mapa sem as licenças de gás e drenagem');
  perform pg_temp.assert(public.obras_publicas()::text not like '%Fulano%', 'mapa publicou nome de pessoa física');
  perform pg_temp.assert(public.licenca_publica(current_setting('cadex.dre1')) ->> 'contratante' is null
                         and public.licenca_publica(current_setting('cadex.dre1')) ->> 'imovel_endereco' = 'Rua A, 100',
    'página pública com nome de pessoa física ou sem o imóvel');
end $$;

rollback;
