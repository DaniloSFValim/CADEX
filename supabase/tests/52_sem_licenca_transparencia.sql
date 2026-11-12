-- =====================================================================
-- Transparência nas obras sem licença: o mapa público traz processo,
-- contrato, ordem de serviço, link da licença e o link das fotos (https).
-- Link de foto que não é https é recusado.
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
  n int;
  j record;
begin
  alter table intervencoes_sem_licenca disable trigger user;

  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Secretaria T52', 'ST52', 'municipal', 'administracao_direta', '{}') returning id into org;

  insert into intervencoes_sem_licenca (setor, tipo_intervencao, escopo, contratante_orgao_id, executora_modo,
    logradouro, tipos_obra, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, situacao,
    processo_sei, processo_administrativo, contrato_numero, ordem_servico_numero, foto_url, publica)
  values ('viario', 'obra', 'Transparência T52', org, 'propria_orgao',
    'Rua T52', '{vala}', -22.9, -43.1, current_date - 1, current_date + 3, 'em_execucao',
    '9900099999/2026', 'PA-52/2026', 'CT-52/2026', 'OS-52/2026', 'https://fotos.example.test/obra52', true);

  select * into j from intervencoes_publicas where escopo = 'Transparência T52';
  perform pg_temp.assert(j.processo_sei = '9900099999/2026', 'o mapa público deveria trazer o processo');
  perform pg_temp.assert(j.processo_administrativo = 'PA-52/2026', 'o mapa público deveria trazer o processo administrativo');
  perform pg_temp.assert(j.contrato_numero = 'CT-52/2026', 'o mapa público deveria trazer o contrato');
  perform pg_temp.assert(j.ordem_servico_numero = 'OS-52/2026', 'o mapa público deveria trazer a ordem de serviço');
  perform pg_temp.assert(j.foto_url = 'https://fotos.example.test/obra52', 'o mapa público deveria trazer o link das fotos');

  begin
    update intervencoes_sem_licenca set foto_url = 'http://insegura.example.test/x' where escopo = 'Transparência T52';
    raise exception 'ASSERT FALHOU: link de foto sem https foi aceito';
  exception when check_violation then null;
  end;
end $$;

rollback;
