-- =====================================================================
-- Retenção e janela pública das comunicações ao CISP.
-- Programado aparece de hoje a 15 dias à frente; emergência, de 15 dias
-- atrás até hoje. Apaga o que venceu há mais de 30 dias (último dia do
-- serviço). Datas são relativas a hoje, em Niterói.
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
  hoje date := public.hoje_niteroi();
  n int;
  apagadas int;
begin
  -- Fixture: empresa já deferida (o gatilho de situação exige um fluxo que não interessa aqui).
  alter table empresas disable trigger user;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('11222333000181','Retenção CSP Ltda.', 'operadora', 'r@csp43.test', '{telecom}', true, 'deferida', true, 'CADEX-CSP-0043')
  returning id into emp;

  -- Programado de hoje (no dia) e de daqui a 5 dias (dentro da janela).
  insert into comunicacoes_servico (id, empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, comunicado_em, inicio_lat, inicio_lng)
  values ('00000000-0000-4000-8000-000000004301', emp, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua A', 'Manutenção',
    hoje, hoje, now() - interval '3 days', -22.9, -43.1),
    ('00000000-0000-4000-8000-000000004302', emp, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua B', 'Manutenção',
    hoje + 5, hoje + 5, now() - interval '3 days', -22.9, -43.1),
    ('00000000-0000-4000-8000-000000004303', emp, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua C', 'Manutenção',
    hoje + 20, hoje + 20, now() - interval '3 days', -22.9, -43.1);

  -- Emergência de agora, depois ajustada para 10 e 20 dias atrás (o gatilho
  -- só valida o fato na gravação; o ajuste de data não altera o tipo).
  insert into comunicacoes_servico (id, empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, ocorrido_em, inicio_lat, inicio_lng)
  values ('00000000-0000-4000-8000-000000004311', emp, 'emergencia', 'Rompimento', 'Plantão', array['ABC1234'], 'Rua D', 'Reparo',
    hoje, hoje, now() - interval '1 hour', -22.9, -43.1),
    ('00000000-0000-4000-8000-000000004312', emp, 'emergencia', 'Rompimento', 'Plantão', array['ABC1234'], 'Rua E', 'Reparo',
    hoje, hoje, now() - interval '1 hour', -22.9, -43.1),
    ('00000000-0000-4000-8000-000000004313', emp, 'emergencia', 'Rompimento', 'Plantão', array['ABC1234'], 'Rua F', 'Reparo',
    hoje, hoje, now() - interval '1 hour', -22.9, -43.1);
  update comunicacoes_servico set inicio_previsto = hoje - 10, fim_previsto = hoje - 10
   where id = '00000000-0000-4000-8000-000000004312';
  update comunicacoes_servico set inicio_previsto = hoje - 20, fim_previsto = hoje - 20
   where id = '00000000-0000-4000-8000-000000004313';

  -- Janela pública.
  select count(*) into n from comunicacoes_publicas
   where id in ('00000000-0000-4000-8000-000000004301', '00000000-0000-4000-8000-000000004302');
  perform pg_temp.assert(n = 2, 'programado de hoje e de daqui a 5 dias deveria estar na janela');
  select count(*) into n from comunicacoes_publicas where id = '00000000-0000-4000-8000-000000004303';
  perform pg_temp.assert(n = 0, 'programado a 20 dias não deveria aparecer');
  select count(*) into n from comunicacoes_publicas
   where id in ('00000000-0000-4000-8000-000000004311', '00000000-0000-4000-8000-000000004312');
  perform pg_temp.assert(n = 2, 'emergência de hoje e de 10 dias atrás deveria estar na janela');
  select count(*) into n from comunicacoes_publicas where id = '00000000-0000-4000-8000-000000004313';
  perform pg_temp.assert(n = 0, 'emergência de 20 dias atrás não deveria aparecer');

  -- Retenção: venceu há 40 dias (sai); venceu há 30 dias (fica).
  insert into comunicacoes_servico (id, empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, comunicado_em, inicio_lat, inicio_lng)
  values ('00000000-0000-4000-8000-000000004321', emp, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua G', 'Manutenção',
    hoje + 1, hoje + 1, now() - interval '1 day', -22.9, -43.1),
    ('00000000-0000-4000-8000-000000004322', emp, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua H', 'Manutenção',
    hoje + 1, hoje + 1, now() - interval '1 day', -22.9, -43.1);
  update comunicacoes_servico set inicio_previsto = hoje - 40, fim_previsto = hoje - 40
   where id = '00000000-0000-4000-8000-000000004321';
  update comunicacoes_servico set inicio_previsto = hoje - 30, fim_previsto = hoje - 30
   where id = '00000000-0000-4000-8000-000000004322';

  apagadas := apagar_comunicacoes_vencidas();
  perform pg_temp.assert(apagadas >= 1, 'deveria apagar a comunicação vencida há 40 dias, apagou ' || apagadas);
  select count(*) into n from comunicacoes_servico where fim_previsto < hoje - 30;
  perform pg_temp.assert(n = 0, 'ainda há comunicação vencida há mais de 30 dias');
  select count(*) into n from comunicacoes_servico where id = '00000000-0000-4000-8000-000000004321';
  perform pg_temp.assert(n = 0, 'comunicação vencida há 40 dias continuou no sistema');
  select count(*) into n from comunicacoes_servico where id = '00000000-0000-4000-8000-000000004322';
  perform pg_temp.assert(n = 1, 'comunicação vencida há 30 dias foi apagada cedo demais');
  select count(*) into n from comunicacoes_servico where id = '00000000-0000-4000-8000-000000004301';
  perform pg_temp.assert(n = 1, 'comunicação de hoje foi apagada');

  -- A função de retenção não é chamável pela aplicação.
  perform pg_temp.assert(not has_function_privilege('authenticated', 'public.apagar_comunicacoes_vencidas()', 'execute'),
    'usuário autenticado pode apagar comunicações');
  perform pg_temp.assert(not has_function_privilege('anon', 'public.apagar_comunicacoes_vencidas()', 'execute'),
    'visitante pode apagar comunicações');
end $$;

rollback;
