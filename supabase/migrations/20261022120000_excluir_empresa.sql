-- =====================================================================
-- Exclusão de empresa pela administração.
--
-- Regras:
--   - Só administrador.
--   - Empresa com licença ou obra sem licença vinculada não é excluída:
--     esses registros são históricos e públicos. Nesse caso, desative.
--   - Empresa ativa só é excluída se estiver "em análise" (cadastro que nunca
--     foi habilitado). Empresa habilitada passa por desativação antes.
--   - O que é do cadastro (documentos, vínculos, responsáveis técnicos,
--     funcionários, veículos, histórico de situação) sai junto, por cascade.
--     A auditoria guarda a linha antes da exclusão, pelo gatilho existente.
--   - Arquivos no Storage não saem daqui: o front os remove depois que esta
--     função confirma a exclusão.
-- =====================================================================
create or replace function public.admin_excluir_empresa(p_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  e public.empresas;
begin
  if not public.is_administrador() then
    raise exception 'Só administrador exclui empresa.' using errcode = 'insufficient_privilege';
  end if;

  select * into e from public.empresas where id = p_id for update;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.licencas l
             where p_id in (l.executora_id, l.contratante_id, l.subcontratada_id))
     or exists (select 1 from public.intervencoes_sem_licenca i where i.executora_id = p_id)
  then
    raise exception 'A empresa tem licença ou registro sem licença vinculado: não pode ser excluída. Desative o cadastro.'
      using errcode = 'check_violation';
  end if;

  if e.ativa and e.situacao <> 'em_analise' then
    raise exception 'Desative o cadastro antes de excluir.' using errcode = 'check_violation';
  end if;

  delete from public.empresas where id = p_id;
end $$;

revoke execute on function public.admin_excluir_empresa(uuid) from public, anon;
grant execute on function public.admin_excluir_empresa(uuid) to authenticated;
