-- =====================================================================
-- Situação pública: a página da licença, o mapa e a lista dão o mesmo
-- resultado. Órgão público é registro; a prorrogação conta; o fim da obra
-- não encerra uma licença cuja validade foi prorrogada.
-- Datas relativas a hoje.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'gestor.sp@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000f1', 'Gestor SP', 'gestor', false);

create temp table ids (nome text primary key, id uuid);
grant select, insert, update on ids to public;

do $$
declare op uuid; org uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, executa_obras, setores)
  values ('12345678000195', 'Operadora SP S.A.', 'OpSP', 'operadora', 'sp@e.test', true, '{telecom}') returning id into op;
  insert into orgaos_publicos (nome, sigla, esfera, setores) values ('Secretaria de Teste', 'SETE', 'municipal', '{viario}')
    returning id into org;
  insert into ids values ('op', op), ('org', org);
end $$;

-- Órgão público: mesmo prazo de 30 dias (inicio há 20 dias, validade em 10). Inserida direto
-- (como no teste 24), porque a regra de contratante não é o alvo deste teste.
alter table licencas disable trigger user;
insert into licencas (setor, processo_sei, numero, tipos_obra, escopo, executora_id, orgao_contratante_id, origem_intervencao,
                      tipo_intervencao, protocolo_data, situacao, inicio_previsto, fim_previsto, codigo_publico)
select 'telecom', 'NIT-050120/000941/2026', '941/2026', array['vala'], 'Órgão público', e.id, (select id from ids where nome = 'org'),
       'municipio', 'obra', current_date - 30, 'deferida', current_date - 20, current_date + 5, 'orgaoconsist01'
  from empresas e where e.cnpj = '12345678000195';
alter table licencas enable trigger user;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant anon to cadex_test_app;
set local role cadex_test_app;

select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f1', true);
do $$
declare
  op uuid := (select id from ids where nome = 'op');
  org uuid := (select id from ids where nome = 'org');
  a uuid; o uuid;
begin
  -- Prorrogada: o fim da obra já passou, mas a validade foi estendida.
  a := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000940/2026','numero','940/2026',
    'tipo_intervencao','obra','tipos_obra',array['vala'],'escopo','Prorrogada','executora_id',op,
    'protocolo_data',to_char(current_date - 30,'YYYY-MM-DD'),'situacao','deferida',
    'inicio_previsto',to_char(current_date - 20,'YYYY-MM-DD'),'fim_previsto',to_char(current_date - 5,'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua Prorrogada', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));
  perform public.prorrogar_licenca(a, current_date + 40);
  insert into ids values ('a', a);

end $$;

do $$
declare
  codA text := (select codigo_publico from licencas where id = (select id from ids where nome = 'a'));
  codO text := 'orgaoconsist01';
begin
  perform pg_temp.assert((public.licenca_publica(codA)->>'situacao') = 'vigente',
    'página: licença prorrogada com fim de obra passado continua vigente');
  perform pg_temp.assert((select elem->>'situacao' from jsonb_array_elements(public.obras_publicas()) elem where elem->>'codigo' = codA) = 'vigente',
    'lista: licença prorrogada continua vigente');
  perform pg_temp.assert((public.licenca_publica(codO)->>'situacao') = 'vigente',
    'página: órgão público segue o prazo de 30 dias (vigente dentro dele)');
  perform pg_temp.assert((select elem->>'situacao' from jsonb_array_elements(public.obras_publicas()) elem where elem->>'codigo' = codO) = 'vigente',
    'lista: órgão público segue o prazo de 30 dias');
end $$;

-- Uma só regra: a função dá o mesmo resultado para qualquer consulta.
do $$
declare r licencas;
begin
  select * into r from licencas where id = (select id from ids where nome = 'a');
  r.concluida_em := current_date; r.fim_previsto := current_date + 5; r.validade_ate := current_date + 5;
  perform pg_temp.assert(public.situacao_publica(r, current_date, false) = 'vigente',
    'concluída dentro do período segue a data (vigente)');
  r.fim_previsto := current_date - 1;
  perform pg_temp.assert(public.situacao_publica(r, current_date, false) = 'concluida',
    'concluída só depois do fim da obra');
  r.concluida_em := null;
  perform pg_temp.assert(public.situacao_publica(r, current_date, true) = 'suspensa',
    'suspensa tem prioridade sobre a validade (licença não concluída)');
  r.situacao := 'cancelada';
  perform pg_temp.assert(public.situacao_publica(r, current_date, true) = 'cancelada',
    'cancelada tem prioridade sobre tudo');
end $$;

rollback;
