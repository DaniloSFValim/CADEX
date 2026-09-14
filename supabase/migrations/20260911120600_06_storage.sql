-- =====================================================================
-- CADEX — 06: buckets de Storage e suas políticas (§35, §36)
-- Todos os buckets são PRIVADOS. O acesso é por signed URL emitida ao
-- usuário que a policy autorizar; nenhum documento é público.
--
-- O schema `storage` só existe num projeto Supabase. Em execução local
-- contra Postgres puro (scripts/test-db.sh) este arquivo é ignorado.
-- =====================================================================

-- Extensões vivem em `extensions`, não em `public` (ver migration 00).
set search_path = public, extensions;

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage ausente — migration 06 ignorada (execução fora do Supabase).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('company-documents',  'company-documents',  false, 26214400,
     array['application/pdf','image/jpeg','image/png']),
    ('license-documents',  'license-documents',  false, 26214400,
     array['application/pdf','image/jpeg','image/png','application/geo+json',
           'application/vnd.google-earth.kml+xml','application/zip']),
    ('inspection-photos',  'inspection-photos',  false, 26214400,
     array['image/jpeg','image/png','image/webp']),
    ('emergency-photos',   'emergency-photos',   false, 26214400,
     array['image/jpeg','image/png','image/webp']),
    ('as-built',           'as-built',           false, 104857600,
     array['application/geo+json','application/vnd.google-earth.kml+xml',
           'application/vnd.google-earth.kmz','application/zip','application/pdf',
           'image/vnd.dwg','application/dxf']),
    ('badges',             'badges',             false, 5242880,
     array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $$;

-- Políticas de objeto. Convenção de caminho: o primeiro segmento do
-- caminho é o id da entidade dona (empresa, licença, fiscalização…),
-- o que permite decidir o acesso sem consultar o conteúdo do arquivo.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;

  -- Documentos do CADEX: a empresa gerencia os seus; a análise lê todos.
  execute $p$
    create policy "cadex_docs_company_rw" on storage.objects for all
      to authenticated
      using (
        bucket_id = 'company-documents'
        and (split_part(name, '/', 1))::uuid = cadex.current_company_id()
      )
      with check (
        bucket_id = 'company-documents'
        and (split_part(name, '/', 1))::uuid = cadex.current_company_id()
      )
  $p$;

  execute $p$
    create policy "cadex_docs_staff_read" on storage.objects for select
      to authenticated
      using (
        bucket_id in ('company-documents','license-documents','as-built','badges')
        and cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[])
      )
  $p$;

  -- Fotos de fiscalização: quem registrou grava; a gestão lê.
  execute $p$
    create policy "inspection_photos_write" on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'inspection-photos'
        and cadex.has_any_role(array['admin','fiscal_viario','guarda_civil']::user_role[])
      )
  $p$;

  execute $p$
    create policy "inspection_photos_read" on storage.objects for select
      to authenticated
      using (bucket_id = 'inspection-photos' and cadex.is_staff())
  $p$;

  -- Fotos de emergência: a executora envia (§19); a gestão e o CISP leem.
  execute $p$
    create policy "emergency_photos_rw" on storage.objects for all
      to authenticated
      using (bucket_id = 'emergency-photos'
             and (cadex.is_staff() or cadex.current_company_id() is not null))
      with check (bucket_id = 'emergency-photos'
             and (cadex.is_staff() or cadex.current_company_id() is not null))
  $p$;

exception when duplicate_object then
  raise notice 'Políticas de storage já existentes — nada a fazer.';
end $$;
