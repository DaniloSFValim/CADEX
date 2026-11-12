-- =====================================================================
-- Mapa público das obras sem licença: as cadastradas por nós (sem_licenca)
-- aparecem só enquanto estão na janela; a obra pública (publica) não sai do
-- mapa; quem executa fora do cadastro também aparece.
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
  org uuid;
  n int;
begin
  alter table empresas disable trigger user;
  alter table intervencoes_sem_licenca disable trigger user;

  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('22333444000181', 'Empresa Mapa T50 Ltda.', 'operadora', 'mapa@t50.test', '{telecom}', true, 'deferida', true, 'CADEX-T50')
  returning id into emp;

  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Secretaria T50', 'ST50', 'municipal', 'administracao_direta', '{}') returning id into org;

  insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo, executora_id,
    logradouro, tipos_obra, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao, concluida_em,
    executora_razao_social, executora_cnpj, publica)
  values ('viario', 'obra', 'Teste empresa', org, 'empresa', emp, 'Rua 1', '{vala}', -22.9, -43.1,
    current_date - 1, current_date + 3, 'em_execucao', null, null, null, false),
    ('viario', 'obra', 'Teste orgao', org, 'propria_orgao', null, 'Rua 2', '{vala}', -22.9, -43.1,
    current_date - 200, current_date - 100, 'concluida', current_date - 100, null, null, false),
    ('viario', 'obra', 'Teste fora do cadastro', org, 'sem_cadastro', null, 'Rua 3', '{vala}', -22.9, -43.1,
    current_date - 1, current_date + 3, 'em_execucao', null, 'Fora SA T50', '66777888000199', false),
    ('viario', 'obra', 'Teste publica contratada', org, 'empresa', emp, 'Rua 4', '{vala}', -22.9, -43.1,
    current_date - 200, current_date - 100, 'concluida', current_date - 100, null, null, true);

  select count(*) into n from intervencoes_publicas where escopo = 'Teste empresa' and categoria = 'sem_licenca';
  perform pg_temp.assert(n = 1, 'obra sem licença em execução deveria aparecer como sem licença');

  select count(*) into n from intervencoes_publicas where escopo = 'Teste orgao' and categoria = 'publica';
  perform pg_temp.assert(n = 1, 'obra do próprio órgão concluída deveria continuar no mapa como pública');

  select count(*) into n from intervencoes_publicas where escopo = 'Teste publica contratada' and categoria = 'publica';
  perform pg_temp.assert(n = 1, 'obra pública contratada por empresa deveria aparecer como pública, mesmo concluída');

  select count(*) into n from intervencoes_publicas where escopo = 'Teste fora do cadastro' and categoria = 'sem_licenca';
  perform pg_temp.assert(n = 1, 'serviço sem licença de empresa fora do cadastro deveria aparecer como sem licença');
end $$;

rollback;
