-- =====================================================================
-- CADEX — 12: a empresa precisa conseguir instruir o próprio pedido
--
-- A migration 06 criou o bucket `license-documents` e deu à SECONSER
-- permissão de LEITURA sobre ele. Nenhuma policy dava à empresa
-- permissão de ESCRITA — e o art. 12 atribui a ela, requerente, o dever
-- de instruir o pedido com planta de locação, cronograma físico e
-- ART/RRT específica. O bucket existia e era inacessível a quem tinha
-- de usá-lo, exatamente como `work_orders` esteve com RLS forçada e
-- nenhuma policy.
--
-- Como sempre, o schema `storage` só existe num projeto Supabase; em
-- Postgres puro (scripts/test-db.sh) este arquivo é ignorado.
-- =====================================================================

set search_path = public, extensions;

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage ausente — migration 12 ignorada (execução fora do Supabase).';
    return;
  end if;

  -- Convenção de caminho: <license_id>/<arquivo>. O primeiro segmento
  -- decide o acesso sem abrir o conteúdo. O teste de formato vem antes
  -- do cast porque um caminho fora da convenção deve NEGAR acesso, não
  -- abortar a consulta com erro de conversão.
  execute $p$
    create policy "license_docs_company_rw" on storage.objects for all
      to authenticated
      using (
        bucket_id = 'license-documents'
        and split_part(name, '/', 1) ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and exists (
          select 1 from licenses l
           where l.id = (split_part(name, '/', 1))::uuid
             and cadex.can_see_intervention(l.intervention_id))
      )
      with check (
        bucket_id = 'license-documents'
        and split_part(name, '/', 1) ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and exists (
          select 1 from licenses l
           where l.id = (split_part(name, '/', 1))::uuid
             and cadex.can_see_intervention(l.intervention_id))
      )
  $p$;

exception when duplicate_object then
  raise notice 'Política license_docs_company_rw já existente — nada a fazer.';
end $$;
