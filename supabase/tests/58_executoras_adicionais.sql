-- =====================================================================
-- Obra sem licença com mais de uma empresa: a lista vai para a view pública;
-- mais de 10 registros, ou algo que não é lista, é recusado.
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
  org uuid;
  j record;
begin
  alter table intervencoes_sem_licenca disable trigger user;

  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Prefeitura T58', 'PT58', 'municipal', 'administracao_direta', '{}') returning id into org;

  insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    logradouro, tipos_obra, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao, publica, executoras_adicionais)
  values ('viario', 'obra', 'Parceria T58', org, 'propria_orgao',
    'Rua T58', '{vala}', -22.9, -43.1, current_date - 1, current_date + 3, 'em_execucao', true,
    '[{"papel":"concessionaria","modo":"sem_cadastro","nome":"Concessionária X","cnpj":null},
      {"papel":"terceirizada","modo":"sem_cadastro","nome":"Terceirizada Y","cnpj":null}]'::jsonb);

  select * into j from intervencoes_publicas where escopo = 'Parceria T58';
  perform pg_temp.assert(jsonb_array_length(j.executoras_adicionais) = 2, 'o mapa público deveria trazer as duas empresas');

  begin
    update intervencoes_sem_licenca set executoras_adicionais = '{"papel":"x"}'::jsonb where escopo = 'Parceria T58';
    raise exception 'ASSERT FALHOU: lista que não é array foi aceita';
  exception when check_violation then null;
  end;

  begin
    update intervencoes_sem_licenca set executoras_adicionais = (select jsonb_agg(jsonb_build_object('papel','terceirizada','modo','sem_cadastro','nome','E' || g)) from generate_series(1, 11) g)
      where escopo = 'Parceria T58';
    raise exception 'ASSERT FALHOU: mais de 10 empresas foram aceitas';
  exception when check_violation then null;
  end;
end $$;

rollback;
