-- =====================================================================
-- Validade da licença: 30 dias a partir da decisão, salvo órgão público.
--
-- Decisão da SECONSER: a licença de obra ou serviço vale 30 dias contados da
-- decisão. Licença vinculada a órgão público não tem validade: é registro,
-- emitido só para controle. A validade pode ser prorrogada (licencas.validade_ate
-- é editável por quem grava licenças; a regra abaixo só recalcula quando a
-- decisão, o órgão ou a situação mudam).
-- =====================================================================

alter table public.licencas add column if not exists validade_ate date;

create or replace function public.licencas_validade()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.orgao_contratante_id is not null then
    new.validade_ate := null;
  elsif new.situacao = 'deferida' and new.decisao_data is not null then
    -- Recalcula só quando a decisão entra ou muda: prorrogação não é desfeita por regravação.
    if tg_op = 'INSERT' then
      new.validade_ate := new.decisao_data + 30;
    elsif old.situacao is distinct from 'deferida'
       or new.decisao_data is distinct from old.decisao_data
       or old.orgao_contratante_id is not null then
      new.validade_ate := new.decisao_data + 30;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists licencas_validade on public.licencas;
create trigger licencas_validade
  before insert or update of decisao_data, orgao_contratante_id, situacao on public.licencas
  for each row execute function public.licencas_validade();

-- Licenças já emitidas: validade = decisão + 30 dias; órgão público fica sem validade.
update public.licencas
   set validade_ate = decisao_data + 30
 where situacao = 'deferida' and orgao_contratante_id is null
   and decisao_data is not null and validade_ate is null;

update public.licencas
   set validade_ate = null
 where orgao_contratante_id is not null and validade_ate is not null;

-- Mapa público: situação pela validade (não mais pelo período da obra).
create or replace function public.obras_publicas()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', l.codigo_publico,
      'setor', l.setor,
      'tipo_intervencao', l.tipo_intervencao,
      'origem', l.origem_intervencao,
      'numero', l.numero,
      'tipos_obra', l.tipos_obra,
      'escopo', l.escopo,
      'inicio_previsto', l.inicio_previsto,
      'fim_previsto', l.fim_previsto,
      'decisao_data', l.decisao_data,
      'validade_ate', l.validade_ate,
      'situacao', case
        when l.situacao = 'cancelada' then 'cancelada'
        when l.concluida_em is not null then 'concluida'
        when l.orgao_contratante_id is not null then 'registro'
        when l.validade_ate is not null and hoje.d > l.validade_ate then 'prazo_encerrado'
        when hoje.d < l.inicio_previsto then 'aguardando_inicio'
        else 'vigente' end,
      'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
      'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                              nullif(btrim(og.sigla), ''), og.nome,
                              case when l.contratante_cpf is null then l.contratante_razao_social end),
      'trechos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'logradouro', t.logradouro, 'bairro', t.bairro,
                 'inicio', jsonb_build_array(t.inicio_lng, t.inicio_lat),
                 'fim', case when t.fim_lat is null then null else jsonb_build_array(t.fim_lng, t.fim_lat) end,
                 'area', case when t.area is null then null else ST_AsGeoJSON(t.area)::jsonb end)
               order by t.ordem)
          from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    order by l.fim_previsto desc), '[]'::jsonb)
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null;
$$;
revoke execute on function public.obras_publicas() from public;
grant  execute on function public.obras_publicas() to anon, authenticated;
