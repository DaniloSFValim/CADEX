-- =====================================================================
-- Consulta pública só mostra empresas com cadastro ativo.
--
-- Antes, a função listava todas as empresas, inclusive as desativadas pela
-- administração. O filtro não muda os dados atuais (todas estão ativas) e
-- permite manter registros de teste fora da consulta pública.
-- =====================================================================

create or replace function public.consulta_publica()
returns table (codigo_cadex text, razao_social text, nome_fantasia text, cnpj text, tipo text, setores text[], situacao text, validade_ate date, portaria_numero text, portaria_data date, contratantes text[], logo_arquivo text)
language sql
stable security definer
set search_path = public
as $function$
  select e.codigo_cadex, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo, e.setores,
         public.situacao_efetiva(e.situacao, e.validade_ate),
         e.validade_ate, e.portaria_numero, e.portaria_data,
         coalesce((
           select array_agg(nome order by nome) from (
             select coalesce(nullif(btrim(c.nome_fantasia), ''), c.razao_social) as nome
               from public.vinculos v join public.empresas c on c.id = v.contratante_id
              where v.contratada_id = e.id and v.fim is null
             union all
             select coalesce(o.sigla, o.nome) as nome
               from public.vinculos v join public.orgaos_publicos o on o.id = v.orgao_contratante_id
              where v.contratada_id = e.id and v.fim is null
           ) nomes
         ), '{}'),
         e.logo_arquivo
    from public.empresas e
   where e.ativa
   order by e.razao_social;
$function$;
