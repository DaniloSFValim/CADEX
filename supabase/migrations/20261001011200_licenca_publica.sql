-- =====================================================================
-- CADEX — página pública da licença (QR Code da placa, art. 14)
--
-- Cada licença ganha um código público aleatório, que vai no QR Code.
-- Ele não é o id interno e não segue sequência: quem não tem a placa
-- não consegue listar nem adivinhar licenças.
--
-- licenca_publica(código) é aberta, sem login, e devolve só o que a
-- placa já exibe (art. 14) mais o necessário à fiscalização: executora
-- e concessionária contratante, tipo e escopo, trechos, cronograma e a
-- situação de hoje. Nada de processo SEI, ART, responsável técnico,
-- subcontratada ou observações. Pedido em análise ou indeferido não
-- aparece: não há placa sem licença.
-- =====================================================================

alter table public.licencas
  add column codigo_publico text not null unique
    default encode(extensions.gen_random_bytes(12), 'hex');

create or replace function public.licenca_publica(p_codigo text)
returns jsonb language sql stable security definer
set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'numero', l.numero,
    'tipos_obra', l.tipos_obra,
    'escopo', l.escopo,
    'inicio_previsto', l.inicio_previsto,
    'fim_previsto', l.fim_previsto,
    'concluida_em', l.concluida_em,
    'situacao', case
      when l.situacao = 'cancelada' then 'cancelada'
      when l.concluida_em is not null then 'concluida'
      when hoje.d < l.inicio_previsto then 'aguardando_inicio'
      when hoje.d > l.fim_previsto then 'prazo_encerrado'
      else 'vigente' end,
    'hoje', hoje.d,
    'executora', jsonb_build_object(
      'razao_social', ex.razao_social, 'nome_fantasia', ex.nome_fantasia, 'codigo_cadex', ex.codigo_cadex,
      'situacao_cadex', public.situacao_efetiva(ex.situacao, ex.validade_ate)),
    'contratante', case when co.id is null then null else jsonb_build_object(
      'razao_social', co.razao_social, 'nome_fantasia', co.nome_fantasia, 'codigo_cadex', co.codigo_cadex) end,
    'trechos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'logradouro', t.logradouro, 'bairro', t.bairro, 'referencia', t.referencia,
               'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng, 'fim_lat', t.fim_lat, 'fim_lng', t.fim_lng)
             order by t.ordem)
        from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    from public.licencas l
    cross join hoje
    join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
   where l.codigo_publico = lower(btrim(p_codigo))
     and l.situacao in ('deferida', 'cancelada');
$$;

revoke execute on function public.licenca_publica(text) from public;
grant  execute on function public.licenca_publica(text) to anon, authenticated;
