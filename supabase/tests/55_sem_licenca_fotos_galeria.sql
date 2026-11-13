-- =====================================================================
-- Galeria das obras sem licença: a lista aceita até 12 links https; a view
-- devolve a lista; link que não é https, ou lista com mais de 12, é recusado.
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
  values ('Secretaria T55', 'ST55', 'municipal', 'administracao_direta', '{}') returning id into org;

  insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    logradouro, tipos_obra, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao, publica, fotos_imagens)
  values ('viario', 'obra', 'Galeria T55', org, 'propria_orgao',
    'Rua T55', '{vala}', -22.9, -43.1, current_date - 1, current_date + 3, 'em_execucao', true,
    array['https://a.example.test/1.jpg', 'https://a.example.test/2.jpg']);

  select * into j from intervencoes_publicas where escopo = 'Galeria T55';
  perform pg_temp.assert(cardinality(j.fotos_imagens) = 2, 'o mapa público deveria trazer a galeria');

  begin
    update intervencoes_sem_licenca set fotos_imagens = array['http://inseguro.example.test/1.jpg'] where escopo = 'Galeria T55';
    raise exception 'ASSERT FALHOU: link sem https foi aceito';
  exception when check_violation then null;
  end;

  begin
    update intervencoes_sem_licenca set fotos_imagens = (select array_agg('https://a.example.test/' || g || '.jpg') from generate_series(1, 13) g)
      where escopo = 'Galeria T55';
    raise exception 'ASSERT FALHOU: lista com mais de 12 foi aceita';
  exception when check_violation then null;
  end;
end $$;

rollback;
