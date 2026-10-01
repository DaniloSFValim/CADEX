-- =====================================================================
-- Licenças anteriores à Resolução (decisão antes de 09/09/2026):
-- processo livre, empresa sem cadastro, sem exigir APTA nem ART.
-- As novas continuam com todas as regras.
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

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000061', 'gestor.hist@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-000000000061', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000061', true);

create temp table ids (nome text primary key, id uuid, codigo text);
grant select on ids to anon;

do $$
declare op uuid; ex uuid; lic uuid; trecho jsonb := jsonb_build_array(jsonb_build_object(
          'logradouro', 'Rua Mem de Sá', 'bairro', 'Icaraí', 'inicio_lat', -22.905, 'inicio_lng', -43.11));
begin
  -- Operadora cadastrada, mas EM ANÁLISE; executora terceirizada sem vínculo
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('12345678000195', 'Operadora Histórica S.A.', 'operadora', 'op@h.test') returning id into op;
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('11444777000161', 'Executora Histórica Ltda.', 'terceirizada', 'ex@h.test') returning id into ex;
  insert into ids values ('op', op, null), ('ex', ex, null);

  -- 2022, executora sem cadastro, processo em outra numeração, sem ART
  lic := public.salvar_licenca(jsonb_build_object(
      'processo_sei', ' 030/001234/2022 ', 'numero', 'LIC-2022/045', 'tipos_obra', array['vala'],
      'escopo', 'Rede subterrânea', 'executora_razao_social', 'Antiga Construtora Ltda.',
      'executora_cnpj', '11.222.333/0001-81', 'contratante_id', op,
      'protocolo_data', '2022-03-01', 'situacao', 'deferida', 'decisao_data', '2022-03-20',
      'inicio_previsto', '2022-04-01', 'fim_previsto', '2022-05-30'), trecho);
  insert into ids select 'lic2022', lic, codigo_publico from licencas where id = lic;
  perform pg_temp.assert((select anterior_resolucao and executora_id is null and executora_cnpj = '11222333000181'
                                 and processo_sei = '030/001234/2022'
                            from licencas where id = lic), 'histórica sem cadastro não gravou como esperado');
  perform pg_temp.assert((select empresas_no_deferimento -> 'executora' ->> 'razao_social' from licencas where id = lic)
    = 'Antiga Construtora Ltda.', 'foto do deferimento sem a executora digitada');

  -- 2024, executora cadastrada mas EM ANÁLISE e terceirizada sem contratante: aceita (anterior)
  perform public.salvar_licenca(jsonb_build_object(
      'processo_sei', 'PROC 2024-777', 'numero', 'LIC-2024/010', 'tipos_obra', array['poste'],
      'escopo', 'Poste', 'executora_id', ex, 'protocolo_data', '2024-01-10', 'situacao', 'deferida',
      'decisao_data', '2024-02-01', 'inicio_previsto', '2024-02-05', 'fim_previsto', '2024-02-20'), trecho);

  -- Executora digitada em licença nova: recusa
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'processo_sei', 'NIT-050120/000901/2026', 'numero', 'LIC 901/2026', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_razao_social', 'Sem Cadastro Ltda.', 'protocolo_data', '2026-09-10', 'situacao', 'deferida',
      'decisao_data', '2026-09-15', 'inicio_previsto', '2026-10-01', 'fim_previsto', '2026-10-10', 'art_numero', 'A'),
    %L::jsonb)$q$, trecho), 'anterior a 09/09/2026', 'aceitou empresa sem cadastro em licença nova');

  -- Em 09/09/2026 já vale a regra nova (APTA)
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'processo_sei', 'NIT-050120/000902/2026', 'numero', 'LIC 902/2026', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_id', %L, 'contratante_id', %L, 'protocolo_data', '2026-09-01', 'situacao', 'deferida',
      'decisao_data', '2026-09-09', 'inicio_previsto', '2026-10-01', 'fim_previsto', '2026-10-10', 'art_numero', 'A'),
    %L::jsonb)$q$, ex, op, trecho), 'não está APTA', 'licença do dia da Resolução escapou da regra APTA');

  -- Executora nos dois formatos ao mesmo tempo, ou em nenhum
  perform pg_temp.recusa(format($q$insert into licencas (processo_sei, tipos_obra, escopo, executora_id,
      executora_razao_social, protocolo_data, decisao_data, situacao)
    values ('X-1', '{vala}', 'x', %L, 'Duplicada', '2022-01-01', '2022-01-02', 'indeferida')$q$, ex),
    'licencas_executora_check', 'aceitou executora cadastrada e digitada juntas');
  perform pg_temp.recusa($q$insert into licencas (processo_sei, tipos_obra, escopo, protocolo_data)
    values ('X-2', '{vala}', 'x', '2022-01-01')$q$, 'licencas_executora_check', 'aceitou licença sem executora');

  -- CNPJ inválido
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'processo_sei', 'X-3', 'numero', 'L-3', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_razao_social', 'CNPJ Errado Ltda.', 'executora_cnpj', '11222333000180',
      'protocolo_data', '2022-01-01', 'situacao', 'deferida', 'decisao_data', '2022-01-02',
      'inicio_previsto', '2022-01-05', 'fim_previsto', '2022-01-10'), %L::jsonb)$q$, trecho),
    'licencas_executora_cnpj_check', 'aceitou CNPJ inválido');

  -- Trocar a data da decisão para depois da Resolução reaplica as regras
  perform pg_temp.recusa(format($q$update licencas set decisao_data = '2026-09-20' where id = %L$q$, lic),
    'anterior a 09/09/2026', 'licença histórica virou nova sem cumprir as regras');
end $$;

-- Página pública mostra a executora digitada, sem código CADEX
reset role;
set local role anon;
do $$
declare j jsonb := public.licenca_publica((select codigo from ids where nome = 'lic2022'));
begin
  perform pg_temp.assert(j -> 'executora' ->> 'razao_social' = 'Antiga Construtora Ltda.'
                         and j -> 'executora' ->> 'codigo_cadex' is null
                         and (j ->> 'anterior_resolucao')::boolean
                         and j ->> 'situacao' = 'prazo_encerrado'
                         and j::text not like '%11222333000181%',
    'página pública da licença histórica errada: ' || j::text);
end $$;

rollback;
