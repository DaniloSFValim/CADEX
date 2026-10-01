-- =====================================================================
-- CADEX — mapa público de obras licenciadas
--
-- obras_publicas() é aberta, sem login, e lista todas as licenças
-- emitidas (deferidas ou canceladas) com os trechos, para o mapa da
-- consulta pública. Devolve o mesmo que a página pública de cada
-- licença já mostra: número, tipo, escopo, período, situação de hoje,
-- executora e contratante (nome), trechos e o código público que leva
-- à página da licença. Nada de processo, ART, responsável técnico,
-- subcontratada, CNPJ digitado ou observações.
-- =====================================================================

create or replace function public.obras_publicas()
returns jsonb language sql stable security definer
set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', l.codigo_publico,
      'numero', l.numero,
      'tipos_obra', l.tipos_obra,
      'escopo', l.escopo,
      'inicio_previsto', l.inicio_previsto,
      'fim_previsto', l.fim_previsto,
      'decisao_data', l.decisao_data,
      'situacao', case
        when l.situacao = 'cancelada' then 'cancelada'
        when l.concluida_em is not null then 'concluida'
        when hoje.d < l.inicio_previsto then 'aguardando_inicio'
        when hoje.d > l.fim_previsto then 'prazo_encerrado'
        else 'vigente' end,
      'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
      'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social, l.contratante_razao_social),
      'trechos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'logradouro', t.logradouro, 'bairro', t.bairro,
                 'inicio', jsonb_build_array(t.inicio_lng, t.inicio_lat),
                 'fim', case when t.fim_lat is null then null else jsonb_build_array(t.fim_lng, t.fim_lat) end)
               order by t.ordem)
          from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    order by l.fim_previsto desc), '[]'::jsonb)
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
   where l.situacao in ('deferida', 'cancelada');
$$;

revoke execute on function public.obras_publicas() from public;
grant  execute on function public.obras_publicas() to anon, authenticated;
