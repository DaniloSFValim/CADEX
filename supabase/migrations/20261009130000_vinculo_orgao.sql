-- =====================================================================
-- CADEX — órgão público como contratante no vínculo da empresa
--
-- Até aqui o vínculo de contratação era só empresa → terceirizada. Há
-- casos em que quem contrata a executora é a própria administração (ex.:
-- a SEMOB contrata uma terceirizada no NIT Bike). Este aditivo permite o
-- órgão público como contratante do vínculo, ao lado das empresas.
--
-- Mantém o que já existia (operadora, concessionária, construtora e a
-- subcontratação terceirizada → terceirizada, art. 2º, VIII). A contratada
-- continua sendo sempre terceirizada. O órgão nunca é contratada, então
-- não entra na checagem de ciclo.
-- =====================================================================

alter table public.vinculos alter column contratante_id drop not null;
alter table public.vinculos
  add column orgao_contratante_id uuid references public.orgaos_publicos(id) on delete restrict;

-- Exatamente uma contratante: empresa OU órgão público.
alter table public.vinculos add constraint vinculos_uma_contratante
  check ((contratante_id is not null) <> (orgao_contratante_id is not null));

create or replace function public.vinculos_antes_de_gravar()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.empresas where id = new.contratada_id and tipo = 'terceirizada') then
    raise exception 'A contratada precisa estar cadastrada como terceirizada.';
  end if;

  if new.contratante_id is not null then
    if not exists (select 1 from public.empresas where id = new.contratante_id) then
      raise exception 'A contratante precisa estar cadastrada no CADEX.';
    end if;
    -- Sem ciclos: a contratada não pode estar, direta ou indiretamente,
    -- acima da contratante na cadeia (só entre empresas).
    if exists (
      with recursive acima(id) as (
        select v.contratante_id from public.vinculos v
         where v.contratada_id = new.contratante_id and v.contratante_id is not null
           and v.id is distinct from new.id
        union
        select v.contratante_id from public.vinculos v join acima a on v.contratada_id = a.id
         where v.contratante_id is not null and v.id is distinct from new.id
      )
      select 1 from acima where id = new.contratada_id
    ) then
      raise exception 'Vínculo circular: a contratada já está acima da contratante nesta cadeia.';
    end if;
  elsif new.orgao_contratante_id is not null then
    if not exists (select 1 from public.orgaos_publicos where id = new.orgao_contratante_id) then
      raise exception 'O órgão público contratante não está cadastrado.';
    end if;
  else
    raise exception 'Informe a contratante: empresa ou órgão público.';
  end if;
  return new;
end;
$$;

-- Consulta pública: as contratantes da terceirizada passam a incluir os
-- órgãos públicos, além das empresas. (Recria a versão vigente de
-- 20261002120000, só mudando o cálculo de `contratantes`.)
drop function public.consulta_publica();

create function public.consulta_publica()
returns table (
  codigo_cadex    text,
  razao_social    text,
  nome_fantasia   text,
  cnpj            text,
  tipo            text,
  setores         text[],
  situacao        text,
  validade_ate    date,
  portaria_numero text,
  portaria_data   date,
  contratantes    text[],
  logo_arquivo    text
)
language sql stable security definer
set search_path = public as $$
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
   order by e.razao_social;
$$;

revoke execute on function public.consulta_publica() from public;
grant  execute on function public.consulta_publica() to anon, authenticated;
