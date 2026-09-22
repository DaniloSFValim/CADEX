-- =====================================================================
-- Testes — autoridade decisória (migration 11)
--
-- Cada bloco abaixo reproduz uma burla que o banco ACEITAVA antes da
-- migration 11, verificada em Postgres real. Todos rodam como papel NÃO
-- superusuário e sob a identidade de uma empresa: superusuário ignora
-- RLS, e um teste que roda como superusuário não prova nada.
-- =====================================================================
begin;
set local search_path = public, extensions;

create or replace function assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create temporary table fx (k text primary key, v uuid) on commit drop;

-- Fixtures como superusuário, antes de baixar privilégio.
do $$
declare
  u_emp uuid := gen_random_uuid();
  u_gestor uuid := '00000000-0000-4000-8000-000000000002';
  c uuid; t uuid; tm uuid; te uuid;
  iv_obra uuid; iv_manut uuid; iv_emerg uuid;
  lic uuid; decl uuid; emer uuid; cisp uuid;
  conc uuid; sub uuid; inapta uuid;
begin
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('05570714000159','Executora Teste','e@t.local','ativo',
          current_date-1, current_date+300) returning id into c;

  insert into auth.users (id, email) values (u_emp,'preposto@t.local');
  insert into profiles (id, full_name, email, company_id)
  values (u_emp,'Preposto','preposto@t.local', c);
  insert into user_roles (user_id, role) values (u_emp,'empresa');

  select id into t  from intervention_types where code='VALA';
  select id into tm from intervention_types where code='EMENDA';
  select id into te from intervention_types where code='EMERGENCIA';

  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('obra', t, c, st_setsrid(st_makepoint(-43.10,-22.88),4326),'obra teste')
  returning id into iv_obra;
  insert into licenses (intervention_id, status) values (iv_obra,'rascunho')
  returning id into lic;

  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('manutencao', tm, c, st_setsrid(st_makepoint(-43.11,-22.89),4326),'manut teste')
  returning id into iv_manut;
  insert into declarations (intervention_id, status, scheduled_start)
  values (iv_manut, 'rascunho', now() + interval '2 hours') returning id into decl;

  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('emergencia', te, c, st_setsrid(st_makepoint(-43.12,-22.90),4326),'emerg teste')
  returning id into iv_emerg;
  insert into cisp_protocols (protocol_number, called_at)
  values ('CISP-TESTE-11', now() - interval '30 hours') returning id into cisp;
  insert into emergencies (intervention_id, cisp_protocol_id, status, risk_nature,
                           risk_category, vehicle_kind, vehicle_plate,
                           on_site_responsible_name, on_site_responsible_doc,
                           on_site_responsible_phone, dispatched_at, concluded_at)
  values (iv_emerg, cisp, 'em_atendimento', 'vazamento de gás', 'risco_iminente',
          'caminhão', 'ABC1D23', 'Responsável', '123456789', '2199999999',
          now() - interval '29 hours', now() - interval '28 hours')
  returning id into emer;

  -- Partes do art. 11: a executora não as enxerga, mas precisa nomeá-las.
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('11222333000181','Concessionaria Teste','c@t.local','ativo',
          current_date-1, current_date+300) returning id into conc;
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('22333444000181','Subcontratada Teste','s@t.local','ativo',
          current_date-1, current_date+300) returning id into sub;
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('33444555000181','Inapta Teste','i@t.local','inapto',
          current_date-400, current_date-30) returning id into inapta;

  insert into fx values ('u',u_emp),('gestor',u_gestor),('c',c),
                        ('obra',iv_obra),('lic',lic),
                        ('decl',decl),('emer',emer),
                        ('conc',conc),('sub',sub),('inapta',inapta);
end $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
  grant authenticated to cadex_test_app;
end $$;

grant usage on schema public, cadex, auth to cadex_test_app;
grant execute on all functions in schema cadex to cadex_test_app;
grant execute on all functions in schema auth to cadex_test_app;
grant select on fx to cadex_test_app;

set local role cadex_test_app;

-- ---------------------------------------------------------------------
-- 1. A empresa não defere a própria licença (art. 13).
--    Antes da migration 11 este UPDATE era aceito, a licença ganhava
--    número e vigência, e `start_intervention` autorizava a obra.
-- ---------------------------------------------------------------------
do $$
declare u uuid; lic uuid; iv uuid; st license_status;
begin
  select v into u from fx where k='u';
  select v into lic from fx where k='lic';
  select v into iv from fx where k='obra';
  perform set_config('cadex.test_user_id', u::text, true);

  begin
    update licenses set status = 'deferida' where id = lic;
    raise exception 'ASSERT FALHOU: *** A EMPRESA DEFERIU A PRÓPRIA LICENÇA ***';
  exception when others then
    if position('ato da SECONSER' in sqlerrm) = 0 then raise; end if;
  end;

  select status into st from licenses where id = lic;
  perform assert(st = 'rascunho', 'a licença saiu de rascunho sem ato administrativo');

  -- E a obra continua barrada.
  begin
    perform public.start_intervention_rpc(iv);
    raise exception 'ASSERT FALHOU: obra iniciou sem licença deferida';
  exception when others then
    if position('sem licença deferida' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 2. A empresa não lavra número, vigência nem decisão (art. 13).
-- ---------------------------------------------------------------------
do $$
declare u uuid; lic uuid;
begin
  select v into u from fx where k='u';
  select v into lic from fx where k='lic';
  perform set_config('cadex.test_user_id', u::text, true);

  begin
    update licenses set license_number = 'LIC-2026-000001' where id = lic;
    raise exception 'ASSERT FALHOU: empresa atribuiu número de licença a si mesma';
  exception when others then
    if position('lavrados pela SECONSER' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update licenses set valid_until = current_date + 3650 where id = lic;
    raise exception 'ASSERT FALHOU: empresa estendeu a própria vigência';
  exception when others then
    if position('lavrados pela SECONSER' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 3. Art. 12 — não há protocolo sem instrução, e o protocolo é do
--    sistema (a empresa não escolhe o próprio número nem o prazo).
-- ---------------------------------------------------------------------
do $$
declare u uuid; lic uuid; num text; due date;
begin
  select v into u from fx where k='u';
  select v into lic from fx where k='lic';
  perform set_config('cadex.test_user_id', u::text, true);

  begin
    update licenses set status = 'protocolada' where id = lic;
    raise exception 'ASSERT FALHOU: protocolo aceito sem os documentos do art. 12';
  exception when others then
    if position('art. 12' in sqlerrm) = 0 then raise; end if;
  end;

  insert into license_documents (license_id, kind, storage_path, file_name, file_size, mime_type)
  values (lic,'planta_locacao','t/p.pdf','p.pdf',10,'application/pdf'),
         (lic,'cronograma_fisico','t/c.pdf','c.pdf',10,'application/pdf');

  begin
    update licenses set status = 'protocolada' where id = lic;
    raise exception 'ASSERT FALHOU: protocolo aceito sem a ART/RRT específica';
  exception when others then
    if position('ART ou RRT' in sqlerrm) = 0 then raise; end if;
  end;

  insert into license_documents (license_id, kind, storage_path, file_name, file_size, mime_type)
  values (lic,'art_rrt','t/a.pdf','a.pdf',10,'application/pdf');

  -- Instruído, o protocolo passa — e o número não é o que a empresa pediu.
  update licenses
     set status = 'protocolada',
         protocol_number = 'PL-FORJADO-0001',
         analysis_due_date = current_date + 3650
   where id = lic;

  select protocol_number, analysis_due_date into num, due from licenses where id = lic;
  perform assert(num is not null and num <> 'PL-FORJADO-0001',
    'a empresa escolheu o próprio número de protocolo');
  perform assert(due = cadex.add_business_days(current_date, 20),
    'o prazo do art. 13 não foi calculado pelo sistema');
end $$;

-- ---------------------------------------------------------------------
-- 4. Protocolada, a empresa não reabre nem empurra o prazo do art. 13
--    (decisão art. 30 (1)).
-- ---------------------------------------------------------------------
do $$
declare u uuid; lic uuid;
begin
  select v into u from fx where k='u';
  select v into lic from fx where k='lic';
  perform set_config('cadex.test_user_id', u::text, true);
  begin
    update licenses set analysis_due_date = current_date + 90 where id = lic;
    raise exception 'ASSERT FALHOU: empresa empurrou o prazo de análise';
  exception when others then
    if position('atribuídos pelo sistema' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 5. Art. 17 — o horário do registro da autodeclaração é do servidor.
--    Antes, bastava retroagi-lo para que qualquer deslocamento parecesse
--    anterior ao registro.
-- ---------------------------------------------------------------------
do $$
declare u uuid; d uuid; reg timestamptz;
begin
  select v into u from fx where k='u';
  select v into d from fx where k='decl';
  perform set_config('cadex.test_user_id', u::text, true);

  update declarations
     set status = 'registrada', registered_at = now() - interval '5 days'
   where id = d;

  select registered_at into reg from declarations where id = d;
  perform assert(reg > now() - interval '1 minute',
    'o registro da autodeclaração aceitou horário retroativo do cliente (art. 17)');

  begin
    update declarations set registered_at = now() - interval '5 days' where id = d;
    raise exception 'ASSERT FALHOU: empresa moveu o horário do registro';
  exception when others then
    if position('lavrado pelo sistema' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 6. Art. 20 — a conclusão do atendimento não se lança no futuro, sob
--    pena de o prazo de 24 horas nunca vencer.
-- ---------------------------------------------------------------------
do $$
declare u uuid; e uuid;
begin
  select v into u from fx where k='u';
  select v into e from fx where k='emer';
  perform set_config('cadex.test_user_id', u::text, true);
  begin
    update emergencies set concluded_at = now() + interval '10 days' where id = e;
    raise exception 'ASSERT FALHOU: prazo do art. 20 empurrado para o futuro';
  exception when others then
    if position('não pode ser lançada no futuro' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 7. Art. 20 — regularização só pela função própria, que exige protocolo
--    CISP, serviço executado e foto, e que decide se houve atraso.
-- ---------------------------------------------------------------------
do $$
declare u uuid; e uuid; st emergency_status;
begin
  select v into u from fx where k='u';
  select v into e from fx where k='emer';
  perform set_config('cadex.test_user_id', u::text, true);

  begin
    update emergencies set status = 'regularizada', regularized_at = now() where id = e;
    raise exception 'ASSERT FALHOU: empresa se declarou regularizada por UPDATE direto';
  exception when others then
    if position('regularize_emergency' in sqlerrm) = 0 then raise; end if;
  end;

  -- Pela função, sem foto, é recusada.
  update emergencies set executed_service = 'reparo de rede' where id = e;
  begin
    perform public.regularize_emergency_rpc(e);
    raise exception 'ASSERT FALHOU: regularização aceita sem as imagens do atendimento';
  exception when others then
    if position('imagens do atendimento' in sqlerrm) = 0 then raise; end if;
  end;

  -- Com foto, passa — e o atraso é reconhecido, não escondido: o
  -- atendimento foi concluído há 28 horas, além das 24 do art. 20.
  insert into emergency_photos (emergency_id, storage_path, caption, taken_at)
  values (e, 't/foto.jpg', 'reparo concluído', now() - interval '28 hours');
  perform public.regularize_emergency_rpc(e);

  select status into st from emergencies where id = e;
  perform assert(st = 'fora_do_prazo',
    'regularização tardia não foi marcada como fora do prazo (art. 20)');
end $$;

-- ---------------------------------------------------------------------
-- 8. O gestor SECONSER defere — é o ato que a empresa não pode praticar.
-- ---------------------------------------------------------------------
do $$
declare g uuid; lic uuid; st license_status; num text;
begin
  select v into g from fx where k='gestor';
  select v into lic from fx where k='lic';
  perform set_config('cadex.test_user_id', g::text, true);

  update licenses set status = 'em_analise' where id = lic;
  perform cadex.approve_license(lic, (current_date + 60)::date, 'Deferida em teste');

  select status, license_number into st, num from licenses where id = lic;
  perform assert(st = 'deferida', 'gestor não conseguiu deferir a licença');
  perform assert(num is not null, 'deferimento não gerou número de licença (art. 14)');
end $$;

-- ---------------------------------------------------------------------
-- 9. Deferida, a empresa inicia e conclui a obra — são atos dela.
-- ---------------------------------------------------------------------
do $$
declare u uuid; iv uuid; lic uuid; st license_status;
begin
  select v into u from fx where k='u';
  select v into iv from fx where k='obra';
  select v into lic from fx where k='lic';
  perform set_config('cadex.test_user_id', u::text, true);

  perform public.start_intervention_rpc(iv);
  select status into st from licenses where id = lic;
  perform assert(st = 'em_execucao', 'início da obra não moveu a licença para em execução');

  update licenses set status = 'concluida' where id = lic;
  perform assert((select status from licenses where id = lic) = 'concluida',
    'a empresa não conseguiu concluir a própria obra');
end $$;

-- ---------------------------------------------------------------------
-- 10-bis. Art. 11 — a executora consegue nomear contratante e
--     subcontratada. Antes da migration 14 isto era recusado: o trigger
--     perguntava a `is_company_active`, que rodava sob a RLS de quem
--     perguntava e não enxergava a linha da outra empresa.
-- ---------------------------------------------------------------------
do $$
declare u uuid; c uuid; conc uuid; sub uuid; t uuid; iv uuid;
begin
  select v into u from fx where k='u';
  select v into c from fx where k='c';
  select v into conc from fx where k='conc';
  select v into sub from fx where k='sub';
  select id into t from intervention_types where code='MND';
  perform set_config('cadex.test_user_id', u::text, true);

  -- A empresa não enxerga as outras duas — e ainda assim pode nomeá-las.
  perform assert((select count(*) from companies where id in (conc, sub)) = 0,
    'a RLS deveria esconder as outras empresas da executora');

  insert into interventions (kind, type_id, concessionaire_id, executor_id,
                             subcontractor_id, geom, description)
  values ('obra', t, conc, c, sub,
          'SRID=4326;POINT(-43.10 -22.88)', 'obra com as tres partes do art. 11')
  returning id into iv;

  perform assert(iv is not null,
    'a executora nao conseguiu nomear contratante e subcontratada (art. 11)');

  -- E o congelamento do art. 11 guardou as três situações cadastrais.
  perform assert(
    (select snapshot->'concessionaire'->>'cnpj' from interventions where id = iv)
      = '11222333000181',
    'o snapshot do art. 11 nao registrou a concessionaria');
  perform assert(
    (select snapshot->'subcontractor'->>'cnpj' from interventions where id = iv)
      = '22333444000181',
    'o snapshot do art. 11 nao registrou a subcontratada');
end $$;

-- ---------------------------------------------------------------------
-- 10-ter. A exigência continua valendo: empresa inapta não entra como
--     parte, mesmo que quem registre não consiga vê-la.
-- ---------------------------------------------------------------------
do $$
declare u uuid; c uuid; inapta uuid; t uuid;
begin
  select v into u from fx where k='u';
  select v into c from fx where k='c';
  select v into inapta from fx where k='inapta';
  select id into t from intervention_types where code='MND';
  perform set_config('cadex.test_user_id', u::text, true);
  begin
    insert into interventions (kind, type_id, concessionaire_id, executor_id, geom, description)
    values ('obra', t, inapta, c, 'SRID=4326;POINT(-43.10 -22.88)', 'com contratante inapta');
    raise exception 'ASSERT FALHOU: empresa inapta aceita como contratante (art. 8º, § 2º)';
  exception when others then
    if position('sem CADEX ativo' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 11. O caminho exato do formulário de 6 etapas, sob papel de empresa:
--     geometria em EWKT como o cliente a envia, trecho com coordenadas,
--     instrução do art. 12, protocolo e releitura em GeoJSON.
-- ---------------------------------------------------------------------
do $$
declare
  u uuid; c uuid; t uuid; iv uuid; l uuid; payload jsonb;
begin
  select v into u from fx where k='u';
  select v into c from fx where k='c';
  select id into t from intervention_types where code='ESCAVACAO';
  perform set_config('cadex.test_user_id', u::text, true);

  -- Etapa 2 grava a intervenção: o cliente manda EWKT, não WKB.
  insert into interventions (
    kind, type_id, executor_id, geom, address, street, district,
    segment_from, segment_to, segment_start, segment_end, length_m,
    description, scope, construction_method, starts_on, ends_on)
  values (
    'obra', t, c,
    'SRID=4326;LINESTRING(-43.1036 -22.8832,-43.1018 -22.8815)',
    'Av. Ernani do Amaral Peixoto, 100', 'Av. Ernani do Amaral Peixoto', 'Centro',
    'nº 100', 'nº 300',
    'SRID=4326;POINT(-43.1036 -22.8832)',
    'SRID=4326;POINT(-43.1018 -22.8815)',
    240.5,
    'Escavação para travessia', 'Travessia de 240 m', 'Céu aberto',
    current_date + 10, current_date + 40)
  returning id into iv;

  insert into licenses (intervention_id, purpose)
  values (iv, 'Expansão de rede') returning id into l;
  perform assert((select status from licenses where id = l) = 'rascunho',
    'a licença deveria nascer em rascunho');

  insert into license_documents (license_id, kind, storage_path, file_name, file_size, mime_type)
  values (l,'planta_locacao',    l || '/planta.pdf',     'planta.pdf',     10,'application/pdf'),
         (l,'cronograma_fisico', l || '/cronograma.pdf', 'cronograma.pdf', 10,'application/pdf'),
         (l,'art_rrt',           l || '/art.pdf',        'art.pdf',        10,'application/pdf');

  update licenses set status = 'protocolada' where id = l;

  -- Releitura do rascunho: a geometria volta em GeoJSON, não em WKB.
  select public.license_draft_rpc(l) into payload;
  perform assert(payload is not null, 'license_draft_rpc não devolveu o pedido');
  perform assert(payload->'geometry'->>'type' = 'LineString',
    'a geometria enviada em EWKT não voltou como GeoJSON LineString');
  perform assert(
    (payload->'geometry'->'coordinates'->0->>0)::numeric = -43.1036,
    'as coordenadas não sobreviveram à ida e volta EWKT → PostGIS → GeoJSON');
  perform assert(payload->'segment_start'->>'type' = 'Point',
    'a coordenada de início do trecho não voltou (art. 2º, VII)');
  perform assert(jsonb_array_length(payload->'documents') = 3,
    'os documentos do art. 12 não vieram junto do rascunho');
  perform assert(payload->'license'->>'protocol_number' is not null,
    'o protocolo não foi atribuído');
end $$;

-- ---------------------------------------------------------------------
-- 12. A RPC de rascunho respeita a RLS: outra empresa não a usa para ler
--     pedido alheio. É SECURITY INVOKER justamente por isso.
-- ---------------------------------------------------------------------
do $$
declare outro uuid := gen_random_uuid(); l uuid; payload jsonb;
begin
  select v into l from fx where k='lic';
  perform set_config('cadex.test_user_id', outro::text, true);
  select public.license_draft_rpc(l) into payload;
  perform assert(payload is null,
    'VAZAMENTO: license_draft_rpc devolveu pedido de outra empresa');
end $$;

-- ---------------------------------------------------------------------
-- 10. `anon` não alcança nada disto — a defesa não depende de um só
--     mecanismo. Migration 10 retirou os GRANTs; a RLS barra as linhas.
-- ---------------------------------------------------------------------
reset role;
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from licenses;
    raise exception 'ASSERT FALHOU: anon leu a tabela licenses';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon',
       (select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname='public' and p.proname='find_active_company_rpc' limit 1),
       'EXECUTE') then
    raise exception 'ASSERT FALHOU: anon pode resolver CNPJ em identificador interno';
  end if;
  if has_function_privilege('anon',
       (select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname='public' and p.proname='license_draft_rpc' limit 1),
       'EXECUTE') then
    raise exception 'ASSERT FALHOU: anon pode ler rascunho de licença';
  end if;
end $$;

reset role;
rollback;
