-- =====================================================================
-- CADEX — subcontratação em qualquer grau
--
-- Art. 2º, VIII: subcontratada é a pessoa jurídica contratada, em
-- qualquer grau, pela empresa executora. Art. 3º, § 1º: ela também
-- precisa de inscrição no CADEX. O vínculo deixa de ser só
-- "operadora → terceirizada" e passa a ser "contratante → contratada":
--
--   operadora    → terceirizada   (concessionária contrata executora)
--   terceirizada → terceirizada   (executora subcontrata, em qualquer grau)
--
-- A contratada é sempre terceirizada. Toda empresa da cadeia é cadastrada
-- e tem código CADEX; o vínculo não depende da situação da inscrição —
-- quem pode atuar continua sendo decidido pela situação (art. 3º).
-- =====================================================================

alter table public.vinculos rename column operadora_id to contratante_id;
alter table public.vinculos rename column terceirizada_id to contratada_id;
alter index public.vinculos_terceirizada_idx rename to vinculos_contratada_idx;
alter table public.vinculos add constraint vinculos_distintas check (contratante_id <> contratada_id);

create or replace function public.vinculos_antes_de_gravar()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.empresas where id = new.contratada_id and tipo = 'terceirizada') then
    raise exception 'A contratada precisa estar cadastrada como terceirizada.';
  end if;
  if not exists (select 1 from public.empresas where id = new.contratante_id) then
    raise exception 'A contratante precisa estar cadastrada no CADEX.';
  end if;

  -- Sem ciclos: a contratada não pode estar, direta ou indiretamente,
  -- acima da contratante na cadeia.
  if exists (
    with recursive acima(id) as (
      select v.contratante_id from public.vinculos v
       where v.contratada_id = new.contratante_id and v.id is distinct from new.id
      union
      select v.contratante_id from public.vinculos v join acima a on v.contratada_id = a.id
       where v.id is distinct from new.id
    )
    select 1 from acima where id = new.contratada_id
  ) then
    raise exception 'Vínculo circular: a contratada já está acima da contratante nesta cadeia.';
  end if;
  return new;
end;
$$;

-- A consulta pública passa a mostrar as contratantes (operadoras e,
-- no caso de subcontratada, terceirizadas).
drop function public.consulta_publica();

create function public.consulta_publica()
returns table (
  codigo_cadex    text,
  razao_social    text,
  nome_fantasia   text,
  cnpj            text,
  tipo            text,
  situacao        text,
  validade_ate    date,
  portaria_numero text,
  portaria_data   date,
  contratantes    text[]
)
language sql stable security definer
set search_path = public as $$
  select e.codigo_cadex, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo,
         public.situacao_efetiva(e.situacao, e.validade_ate),
         e.validade_ate, e.portaria_numero, e.portaria_data,
         coalesce((select array_agg(coalesce(nullif(btrim(c.nome_fantasia), ''), c.razao_social)
                                    order by c.razao_social)
                     from public.vinculos v join public.empresas c on c.id = v.contratante_id
                    where v.contratada_id = e.id and v.fim is null), '{}')
    from public.empresas e
   order by e.razao_social;
$$;

revoke execute on function public.consulta_publica() from public;
grant  execute on function public.consulta_publica() to anon, authenticated;
