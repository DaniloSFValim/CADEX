-- =====================================================================
-- CADEX — logo da empresa
--
-- O logo aparece na área restrita, na ficha exportada e na consulta
-- pública. Fica num bucket público próprio (`logos`), separado dos
-- documentos, que continuam privados. Só o gestor envia ou troca.
-- SVG fica de fora: pode carregar script.
-- =====================================================================

alter table public.empresas
  add column logo_arquivo text,
  add constraint empresas_logo_na_pasta
    check (logo_arquivo is null or logo_arquivo like id::text || '/%');

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage ausente — bucket de logos não criado (execução fora do Supabase).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

  execute 'drop policy if exists logos_gestor on storage.objects';
  execute $p$
    create policy logos_gestor on storage.objects for all to authenticated
      using (bucket_id = 'logos' and public.is_gestor())
      with check (bucket_id = 'logos' and public.is_gestor())
  $p$;
end $$;

-- Consulta pública passa a devolver o caminho do logo.
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
  contratantes    text[],
  logo_arquivo    text
)
language sql stable security definer
set search_path = public as $$
  select e.codigo_cadex, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo,
         public.situacao_efetiva(e.situacao, e.validade_ate),
         e.validade_ate, e.portaria_numero, e.portaria_data,
         coalesce((select array_agg(coalesce(nullif(btrim(c.nome_fantasia), ''), c.razao_social)
                                    order by c.razao_social)
                     from public.vinculos v join public.empresas c on c.id = v.contratante_id
                    where v.contratada_id = e.id and v.fim is null), '{}'),
         e.logo_arquivo
    from public.empresas e
   order by e.razao_social;
$$;

revoke execute on function public.consulta_publica() from public;
grant  execute on function public.consulta_publica() to anon, authenticated;
