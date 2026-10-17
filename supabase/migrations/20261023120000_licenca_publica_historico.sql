-- =====================================================================
-- Trilha de situação na página pública da licença.
-- Lê a auditoria, mas devolve só data e evento: nada de quem alterou,
-- nem valores antes/depois, nem campos internos. Mesmo filtro da página
-- pública (deferida ou cancelada, não excluída).
-- =====================================================================

create or replace function public.licenca_publica_historico(p_codigo text)
returns jsonb language sql stable security definer
set search_path = public as $$
  with licenca as (
    select l.id from public.licencas l
     where l.codigo_publico = lower(btrim(p_codigo))
       and l.situacao in ('deferida', 'cancelada')
       and l.excluida_em is null
  ), eventos as (
    select a.em,
      (a.em at time zone 'America/Sao_Paulo')::date as data,
      case
        when a.operacao = 'INSERT' then 'Pedido registrado'
        when a.antes->>'situacao' is distinct from a.depois->>'situacao' then
          case a.depois->>'situacao'
            when 'em_analise' then 'Em análise'
            when 'deferida' then 'Deferida'
            when 'indeferida' then 'Indeferida'
            when 'cancelada' then 'Cancelada'
          end
        when a.antes->>'concluida_em' is null and a.depois->>'concluida_em' is not null then 'Obra concluída'
      end as evento
      from public.auditoria a
      join licenca on licenca.id = a.registro_id
     where a.tabela = 'licencas' and a.operacao in ('INSERT', 'UPDATE')
  )
  select coalesce(jsonb_agg(jsonb_build_object('data', data, 'evento', evento) order by em), '[]'::jsonb)
    from eventos
   where evento is not null;
$$;

revoke execute on function public.licenca_publica_historico(text) from public;
grant  execute on function public.licenca_publica_historico(text) to anon, authenticated;
