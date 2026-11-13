-- =====================================================================
-- O cartão público das obras sem licença mostra o órgão contratante:
-- a view intervencoes_publicas devolve o nome do órgão.
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
  values ('Secretaria de Obras T54', 'SOT54', 'municipal', 'administracao_direta', '{}') returning id into org;

  insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    logradouro, tipos_obra, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao, publica)
  values ('viario', 'obra', 'Contratante T54', org, 'propria_orgao',
    'Rua T54', '{vala}', -22.9, -43.1, current_date - 1, current_date + 3, 'em_execucao', true);

  select * into j from intervencoes_publicas where escopo = 'Contratante T54';
  perform pg_temp.assert(j.contratante = 'Secretaria de Obras T54', 'o mapa público deveria trazer o órgão contratante');
end $$;

rollback;
