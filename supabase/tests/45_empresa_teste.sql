-- =====================================================================
-- Público: só empresas deferidas ou aptas; empresa de teste nunca.
-- A empresa de teste fica no sistema para testes internos.
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
  emp_real uuid;
  emp_teste uuid;
  emp_analise uuid;
  lic_teste uuid;
  lic_real uuid;
  codigo_teste text;
  codigo_real text;
  n int;
begin
  alter table empresas disable trigger user;
  alter table licencas disable trigger licencas_antes_de_gravar;

  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('11222333000181', 'Empresa Real Teste Ltda.', 'operadora', 'real@t45.test', '{telecom}', true, 'deferida', true, 'CADEX-T45-REAL')
  returning id into emp_real;

  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('22333444000181', 'Empresa de Teste Ltda.', 'operadora', 'teste@t45.test', '{telecom}', true, 'deferida', true, 'CADEX-T45-TESTE')
  returning id into emp_teste;

  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('33444555000181', 'Empresa Em Análise Ltda.', 'operadora', 'analise@t45.test', '{telecom}', true, 'em_analise', true, 'CADEX-T45-ANALISE')
  returning id into emp_analise;

  update empresas set teste = true where id = emp_teste;
  perform pg_temp.assert((select e.teste from empresas e where e.id = emp_teste), 'a empresa de teste deveria estar marcada');

  insert into licencas (setor, processo_sei, numero, tipos_obra, escopo, executora_id, protocolo_data, inicio_previsto, fim_previsto, situacao)
  values ('telecom', 'NIT-050120/000201/2026', '901/2026', '{vala}', 'Real', emp_real, current_date - 10, current_date - 5, current_date + 30, 'deferida')
  returning id, codigo_publico into lic_real, codigo_real;

  insert into licencas (setor, processo_sei, numero, tipos_obra, escopo, executora_id, protocolo_data, inicio_previsto, fim_previsto, situacao)
  values ('telecom', 'NIT-050120/000202/2026', '902/2026', '{vala}', 'Teste', emp_teste, current_date - 10, current_date - 5, current_date + 30, 'deferida')
  returning id, codigo_publico into lic_teste, codigo_teste;

  insert into licenca_trechos (licenca_id, ordem, logradouro, bairro, inicio_lat, inicio_lng)
  values (lic_real, 1, 'Rua Real', 'Centro', -22.9, -43.1),
         (lic_teste, 1, 'Rua Teste', 'Centro', -22.9, -43.1);

  -- Mapa: a licença da empresa real aparece; a da empresa de teste, não.
  select count(*) into n from jsonb_array_elements(public.obras_publicas()) o where o->>'codigo' = codigo_real;
  perform pg_temp.assert(n = 1, 'a licença da empresa real deveria aparecer no mapa');
  select count(*) into n from jsonb_array_elements(public.obras_publicas()) o where o->>'codigo' = codigo_teste;
  perform pg_temp.assert(n = 0, 'a licença da empresa de teste apareceu no mapa');

  select count(*) into n from jsonb_array_elements(public.obras_geojson()->'features') f where f->'properties'->>'codigo' = codigo_teste;
  perform pg_temp.assert(n = 0, 'a licença da empresa de teste apareceu nos dados abertos');

  -- Página pública da licença.
  perform pg_temp.assert(public.licenca_publica(codigo_teste) is null,
    'a página pública abriu a licença da empresa de teste');
  perform pg_temp.assert(public.licenca_publica(codigo_real) is not null,
    'a página pública deveria abrir a licença da empresa real');

  -- Consulta de empresas: só deferida ou apta, e nunca a de teste.
  select count(*) into n from public.consulta_publica() c where c.codigo_cadex = 'CADEX-T45-TESTE';
  perform pg_temp.assert(n = 0, 'a empresa de teste apareceu na consulta pública');
  select count(*) into n from public.consulta_publica() c where c.codigo_cadex = 'CADEX-T45-ANALISE';
  perform pg_temp.assert(n = 0, 'a empresa em análise apareceu na consulta pública');
  select count(*) into n from public.consulta_publica() c where c.codigo_cadex = 'CADEX-T45-REAL';
  perform pg_temp.assert(n = 1, 'a empresa real deveria aparecer na consulta pública');

  -- Comunicação de empresa de teste não aparece no mapa público do CISP.
  insert into comunicacoes_servico (empresa_id, tipo, tipo_servico, responsavel, placas, local_servico, descricao,
    inicio_previsto, fim_previsto, inicio_lat, inicio_lng)
  values (emp_teste, 'programado', 'Manutenção', 'Fulano', array['ABC1234'], 'Rua T', 'Teste',
    public.hoje_niteroi(), public.hoje_niteroi(), -22.9, -43.1);
  select count(*) into n from comunicacoes_publicas where razao_social = 'Empresa de Teste Ltda.';
  perform pg_temp.assert(n = 0, 'comunicação da empresa de teste apareceu no mapa público');
end $$;

rollback;
