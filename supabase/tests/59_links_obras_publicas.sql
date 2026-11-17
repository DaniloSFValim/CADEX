-- =====================================================================
-- Links da obra pública: a lista vai para a view pública; mais de 8 é recusado.
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
  values ('Prefeitura T59', 'PT59', 'municipal', 'administracao_direta', '{}') returning id into org;

  insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    logradouro, tipos_obra, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao, publica, links_publicos)
  values ('viario', 'obra', 'Links T59', org, 'propria_orgao',
    'Rua T59', '{vala}', -22.9, -43.1, current_date - 1, current_date + 3, 'em_execucao', true,
    '[{"rotulo":"Projeto","url":"https://docs.example.test/p.pdf"}]'::jsonb);

  select * into j from intervencoes_publicas where escopo = 'Links T59';
  perform pg_temp.assert(jsonb_array_length(j.links_publicos) = 1, 'o mapa público deveria trazer os links');

  begin
    update intervencoes_sem_licenca set links_publicos = (select jsonb_agg(jsonb_build_object('rotulo','L' || g,'url','https://x.example.test/' || g)) from generate_series(1, 9) g)
      where escopo = 'Links T59';
    raise exception 'ASSERT FALHOU: mais de 8 links foram aceitos';
  exception when check_violation then null;
  end;
end $$;

rollback;
