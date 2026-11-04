-- =====================================================================
-- conflitos_de_licenca: só servidor ativo recebe o resultado.
--
-- A função roda como SECURITY DEFINER (lê licenças de outras empresas,
-- com número de processo e executora) e estava liberada a qualquer
-- usuário autenticado. Agora a consulta só devolve linhas para servidor
-- ativo (is_servidor). Assinatura e corpo iguais, só com a checagem.
-- =====================================================================
create or replace function public.conflitos_de_licenca(p_id uuid)
returns table(tipo text, licenca_id uuid, numero text, processo_sei text, executora text,
              distancia_m integer, logradouro text, ate date)
language sql
stable
security definer
set search_path = public, extensions
as $function$
  with alvo as (
    select l.inicio_previsto, l.fim_previsto from licencas l where l.id = p_id
  ),
  alvo_geo as (
    select case when t.fim_lat is not null and t.fim_lng is not null
             then ST_MakeLine(ST_MakePoint(t.inicio_lng, t.inicio_lat), ST_MakePoint(t.fim_lng, t.fim_lat))::geography
             else ST_MakePoint(t.inicio_lng, t.inicio_lat)::geography end as g
      from licenca_trechos t where t.licenca_id = p_id
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  cand as (
    select o.id, o.numero, o.processo_sei, o.situacao, o.concluida_em, o.recomposicao_data,
           o.inicio_previsto, o.fim_previsto,
           coalesce(nullif(btrim(e.nome_fantasia), ''), e.razao_social, o.executora_razao_social) as executora,
           ot.logradouro,
           ceil(min(ST_Distance(ag.g,
             case when ot.fim_lat is not null and ot.fim_lng is not null
               then ST_MakeLine(ST_MakePoint(ot.inicio_lng, ot.inicio_lat), ST_MakePoint(ot.fim_lng, ot.fim_lat))::geography
               else ST_MakePoint(ot.inicio_lng, ot.inicio_lat)::geography end))) as dist
      from licencas o
      join licenca_trechos ot on ot.licenca_id = o.id
      left join empresas e on e.id = o.executora_id
      cross join alvo_geo ag
     where o.id <> p_id
       and o.excluida_em is null
       and o.situacao not in ('cancelada', 'indeferida')
       and ST_DWithin(ag.g,
             case when ot.fim_lat is not null and ot.fim_lng is not null
               then ST_MakeLine(ST_MakePoint(ot.inicio_lng, ot.inicio_lat), ST_MakePoint(ot.fim_lng, ot.fim_lat))::geography
               else ST_MakePoint(ot.inicio_lng, ot.inicio_lat)::geography end, 15)
     group by o.id, o.numero, o.processo_sei, o.situacao, o.concluida_em, o.recomposicao_data,
              o.inicio_previsto, o.fim_previsto, executora, ot.logradouro
  )
  select distinct on (c.id)
    case when c.concluida_em is not null and c.recomposicao_data is not null then 'recomposicao' else 'vigente' end as tipo,
    c.id, c.numero, c.processo_sei, c.executora, c.dist::int as distancia_m, c.logradouro,
    case when c.concluida_em is not null and c.recomposicao_data is not null
           then (c.recomposicao_data + interval '24 months')::date
         else c.fim_previsto end as ate
  from cand c
  where public.is_servidor()
    and (
      -- (a) recém-recomposta, ainda na garantia
      (c.concluida_em is not null and c.recomposicao_data is not null
         and (select d from hoje) <= c.recomposicao_data + interval '24 months')
      or
      -- (b) vigente (deferida, não concluída), com janela de cronograma sobreposta à do alvo
      (c.situacao = 'deferida' and c.concluida_em is null
         and c.inicio_previsto is not null and c.fim_previsto is not null
         and (select inicio_previsto from alvo) is not null and (select fim_previsto from alvo) is not null
         and c.inicio_previsto <= (select fim_previsto from alvo)
         and c.fim_previsto >= (select inicio_previsto from alvo))
    )
  order by c.id, c.dist;
$function$;
