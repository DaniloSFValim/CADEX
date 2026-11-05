-- =====================================================================
-- Desempenho e políticas: sem alterar quem enxerga ou grava o quê.
-- 1) servidores_propria: auth.uid() avaliado uma vez por consulta, não por linha.
-- 2) Políticas *_gravar (FOR ALL) também valiam para SELECT, somando-se a *_ler.
--    Trocadas por INSERT/UPDATE/DELETE com o mesmo predicado; o SELECT fica só em *_ler.
-- 3) Índices nas chaves estrangeiras das tabelas quentes.
-- =====================================================================

drop policy if exists servidores_propria on public.servidores;
create policy servidores_propria on public.servidores for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists funcionarios_gravar on public.funcionarios;
create policy funcionarios_inserir on public.funcionarios for insert to authenticated with check (is_gestor());
create policy funcionarios_alterar on public.funcionarios for update to authenticated using (is_gestor()) with check (is_gestor());
create policy funcionarios_excluir on public.funcionarios for delete to authenticated using (is_gestor());

drop policy if exists isl_gravar on public.intervencoes_sem_licenca;
create policy intervencoes_sem_licenca_inserir on public.intervencoes_sem_licenca for insert to authenticated with check ((is_gestor() OR is_licenciador()));
create policy intervencoes_sem_licenca_alterar on public.intervencoes_sem_licenca for update to authenticated using ((is_gestor() OR is_licenciador())) with check ((is_gestor() OR is_licenciador()));
create policy intervencoes_sem_licenca_excluir on public.intervencoes_sem_licenca for delete to authenticated using ((is_gestor() OR is_licenciador()));

drop policy if exists licenca_trechos_gravar on public.licenca_trechos;
create policy licenca_trechos_inserir on public.licenca_trechos for insert to authenticated with check ((is_gestor() OR is_licenciador()));
create policy licenca_trechos_alterar on public.licenca_trechos for update to authenticated using ((is_gestor() OR is_licenciador())) with check ((is_gestor() OR is_licenciador()));
create policy licenca_trechos_excluir on public.licenca_trechos for delete to authenticated using ((is_gestor() OR is_licenciador()));

drop policy if exists licencas_gravar on public.licencas;
create policy licencas_inserir on public.licencas for insert to authenticated with check (((is_gestor() OR is_licenciador()) AND (excluida_em IS NULL)));
create policy licencas_alterar on public.licencas for update to authenticated using (((is_gestor() OR is_licenciador()) AND (excluida_em IS NULL))) with check (((is_gestor() OR is_licenciador()) AND (excluida_em IS NULL)));
create policy licencas_excluir on public.licencas for delete to authenticated using (((is_gestor() OR is_licenciador()) AND (excluida_em IS NULL)));

drop policy if exists orgaos_gravar on public.orgaos_publicos;
create policy orgaos_publicos_inserir on public.orgaos_publicos for insert to authenticated with check (is_gestor());
create policy orgaos_publicos_alterar on public.orgaos_publicos for update to authenticated using (is_gestor()) with check (is_gestor());
create policy orgaos_publicos_excluir on public.orgaos_publicos for delete to authenticated using (is_gestor());

drop policy if exists responsaveis_gravar on public.responsaveis_tecnicos;
create policy responsaveis_tecnicos_inserir on public.responsaveis_tecnicos for insert to authenticated with check (is_gestor());
create policy responsaveis_tecnicos_alterar on public.responsaveis_tecnicos for update to authenticated using (is_gestor()) with check (is_gestor());
create policy responsaveis_tecnicos_excluir on public.responsaveis_tecnicos for delete to authenticated using (is_gestor());

drop policy if exists veiculos_gravar on public.veiculos;
create policy veiculos_inserir on public.veiculos for insert to authenticated with check (is_gestor());
create policy veiculos_alterar on public.veiculos for update to authenticated using (is_gestor()) with check (is_gestor());
create policy veiculos_excluir on public.veiculos for delete to authenticated using (is_gestor());

drop policy if exists vinculos_gravar on public.vinculos;
create policy vinculos_inserir on public.vinculos for insert to authenticated with check (is_gestor());
create policy vinculos_alterar on public.vinculos for update to authenticated using (is_gestor()) with check (is_gestor());
create policy vinculos_excluir on public.vinculos for delete to authenticated using (is_gestor());

create index if not exists documentos_enviado_por_idx on public.documentos (enviado_por);
create index if not exists documentos_tipo_idx on public.documentos (tipo);
create index if not exists documentos_oficiais_emitido_por_idx on public.documentos_oficiais (emitido_por);
create index if not exists historico_situacao_por_idx on public.historico_situacao (por);
create index if not exists intervencoes_sem_licenca_executora_id_idx on public.intervencoes_sem_licenca (executora_id);
create index if not exists intervencoes_sem_licenca_licenca_id_idx on public.intervencoes_sem_licenca (licenca_id);
create index if not exists licencas_orgao_contratante_id_idx on public.licencas (orgao_contratante_id);
create index if not exists licencas_responsavel_tecnico_id_idx on public.licencas (responsavel_tecnico_id);
create index if not exists veiculos_concessionaria_traseira_id_idx on public.veiculos (concessionaria_traseira_id);
create index if not exists veiculos_empresa_id_idx on public.veiculos (empresa_id);
create index if not exists vinculos_orgao_contratante_id_idx on public.vinculos (orgao_contratante_id);
