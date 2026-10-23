-- =====================================================================
-- Mapa público: lista só licenças emitidas, com trechos em [lng, lat],
-- sem dados internos; anônimo lê pela função, nunca pelas tabelas.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000071', 'gestor.mapa@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-000000000071', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000071', true);

do $$
declare op uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Mapa S.A.', 'OpMapa', 'operadora', 'op@m.test') returning id into op;

  -- Histórica emitida, com executora digitada e CNPJ (não pode aparecer)
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'PROC-INTERNO-1', 'numero', '010/2023', 'tipos_obra', array['vala'], 'escopo', 'Vala',
      'executora_razao_social', 'Antiga Ltda.', 'executora_cnpj', '11222333000181', 'contratante_id', op,
      'observacoes', 'nota interna', 'protocolo_data', '2023-01-10', 'situacao', 'deferida',
      'inicio_previsto', '2023-02-01', 'fim_previsto', '2023-03-01'),
    jsonb_build_array(
      jsonb_build_object('logradouro', 'Rua A', 'bairro', 'Centro', 'inicio_lat', -22.895, 'inicio_lng', -43.123,
                         'fim_lat', -22.897, 'fim_lng', -43.120),
      jsonb_build_object('logradouro', 'Rua B', 'inicio_lat', -22.90, 'inicio_lng', -43.11)));

  -- Pedido em análise: não aparece
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'PROC-INTERNO-2', 'tipos_obra', array['poste'], 'escopo', 'Poste',
      'executora_id', op, 'protocolo_data', '2026-09-20'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua C', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));
end $$;

reset role;
set local role anon;
do $$
declare j jsonb := public.obras_publicas();
        o jsonb := j -> 0;
begin
  perform pg_temp.assert(jsonb_array_length(j) = 1, 'mapa listou pedido não emitido: ' || jsonb_array_length(j));
  perform pg_temp.assert(o ->> 'numero' = '010/2023' and o ->> 'situacao' = 'prazo_encerrado',
    'licença histórica errada no mapa');
  perform pg_temp.assert(o ->> 'executora' = 'Antiga Ltda.' and o ->> 'contratante' = 'OpMapa', 'nomes errados no mapa');
  perform pg_temp.assert(o -> 'trechos' -> 0 -> 'inicio' = '[-43.123, -22.895]'::jsonb, 'coordenada fora da ordem [lng, lat]');
  perform pg_temp.assert(o -> 'trechos' -> 1 -> 'fim' = 'null'::jsonb, 'trecho pontual com fim');
  perform pg_temp.assert(length(o ->> 'codigo') = 24, 'sem o código público');
  perform pg_temp.assert(j::text not like '%PROC-INTERNO%' and j::text not like '%11222333000181%'
                         and j::text not like '%nota interna%',
    'vazou dado interno no mapa');
end $$;

rollback;
