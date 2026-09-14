-- =====================================================================
-- CADEX — 09: correções de segurança apuradas no primeiro deploy real
--
-- As três falhas abaixo NÃO foram detectadas pela suíte local, por um
-- motivo que vale registrar: os testes inserem em `work_orders` e
-- chamam as RPC como SUPERUSUÁRIO, e superusuário ignora RLS e ignora
-- GRANT. Só a aplicação num projeto Supabase real, com os papéis `anon`
-- e `authenticated` de verdade, expôs o problema.
-- =====================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- FALHA 1 — `work_orders` com RLS habilitada e FORÇADA, sem policy
-- alguma. Efeito prático: o módulo de Ordem de Serviço estava
-- inacessível a TODOS os papéis da aplicação. Não era vazamento; era
-- negação total de serviço silenciosa (art. 25).
-- ---------------------------------------------------------------------
create policy work_orders_read on work_orders for select
  using (cadex.is_staff()
         or cadex.current_company_id() in (executor_id, subcontractor_id, concessionaire_id));

create policy work_orders_write on work_orders for all
  using (cadex.has_any_role(array['admin','gestor_seconser']::user_role[])
         or cadex.current_company_id() in (executor_id, subcontractor_id))
  with check (cadex.has_any_role(array['admin','gestor_seconser']::user_role[])
         or cadex.current_company_id() in (executor_id, subcontractor_id));

-- ---------------------------------------------------------------------
-- FALHA 2 — `anon` podia executar todas as RPC.
--
-- O PostgreSQL concede EXECUTE ao pseudo-papel PUBLIC por padrão em toda
-- função criada. O `grant ... to authenticated` que eu havia escrito era
-- decorativo: não acrescentava nada que PUBLIC já não desse, e não
-- excluía o `anon`.
--
-- Duas funções não tinham checagem interna de papel e ficavam, portanto,
-- efetivamente abertas a quem conhecesse um UUID: start_intervention e
-- regularize_emergency. Identificador difícil de adivinhar não é
-- controle de autorização.
-- ---------------------------------------------------------------------
do $do$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'approve_company_rpc','approve_license_rpc','start_intervention_rpc',
         'regularize_emergency_rpc','run_deadline_sweep_rpc','reinstate_company_rpc',
         'disqualify_emergency_rpc','dashboard_metrics','verify_badge','transition_status')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('revoke execute on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;

  -- Somente estas duas são deliberadamente públicas: são a verificação
  -- de autenticidade do QR Code (art. 14) e a consulta de proximidade
  -- sobre a camada já publicada (art. 7º, § 2º). Nenhuma expõe dado
  -- pessoal nem permite escrita.
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('verify_public_token','interventions_near')
  loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $do$;

-- Defesa em profundidade: as duas funções que dependiam apenas do GRANT
-- passam a verificar o papel internamente, como as demais já faziam.
create or replace function cadex.start_intervention(p_intervention_id uuid)
returns interventions language plpgsql security definer set search_path = public, cadex, extensions as $fn$
declare i interventions%rowtype; l licenses%rowtype;
begin
  select * into i from interventions where id = p_intervention_id for update;
  if not found then raise exception 'Intervenção não encontrada.'; end if;

  -- Só a gestão ou as empresas responsáveis pela intervenção registram o início.
  if not (cadex.has_any_role(array['admin','gestor_seconser']::user_role[])
          or cadex.current_company_id() in (i.executor_id, i.subcontractor_id)) then
    raise exception 'Registro de início restrito à SECONSER ou à empresa responsável pela intervenção.';
  end if;

  if i.kind = 'obra' then
    select * into l from licenses where intervention_id = i.id;
    if l.status is distinct from 'deferida' then
      raise exception 'Obra não pode iniciar sem licença deferida (art. 11). Situação: %',
        coalesce(l.status::text,'sem licença');
    end if;
    if l.valid_until is not null and l.valid_until < current_date then
      raise exception 'Licença vencida em %.', l.valid_until;
    end if;
    update licenses set status = 'em_execucao' where id = l.id;
  end if;

  update interventions set started_at = now() where id = i.id returning * into i;
  return i;
end;
$fn$;

-- Art. 20: o registro é dever da empresa executora; a gestão também pode
-- registrar no exercício da fiscalização.
create or replace function cadex.regularize_emergency(p_emergency_id uuid)
returns emergencies language plpgsql security definer set search_path = public, cadex, extensions as $fn$
declare e emergencies%rowtype; i interventions%rowtype;
begin
  select * into e from emergencies where id = p_emergency_id for update;
  if not found then raise exception 'Emergência não encontrada.'; end if;

  select * into i from interventions where id = e.intervention_id;
  if not (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser','cisp_seop']::user_role[])
          or cadex.current_company_id() in (i.executor_id, i.subcontractor_id)) then
    raise exception 'Regularização restrita à empresa executora (art. 20) ou à SECONSER/CISP.';
  end if;

  if e.concluded_at is null then
    raise exception
      'O prazo do art. 20 corre da conclusão do atendimento; registre a conclusão antes de regularizar.';
  end if;
  if e.cisp_protocol_id is null then
    raise exception 'A regularização exige o número do protocolo do CISP (art. 20).';
  end if;
  if coalesce(e.executed_service,'') = '' then
    raise exception 'A regularização exige o escopo do serviço executado (art. 20).';
  end if;
  if not exists (select 1 from emergency_photos where emergency_id = p_emergency_id) then
    raise exception 'A regularização exige as imagens do atendimento (art. 20).';
  end if;

  update emergencies
     set regularized_at = now(),
         status = case
           when now() > e.regularization_due_at then 'fora_do_prazo'::emergency_status
           else 'regularizada'::emergency_status end
   where id = p_emergency_id
   returning * into e;
  return e;
end;
$fn$;

-- ---------------------------------------------------------------------
-- FALHA 3 — funções sem `search_path` fixo.
-- Função sem search_path resolve nomes conforme o search_path de quem a
-- chama. Fixá-lo é endurecimento barato e elimina a classe inteira de
-- ataque por objeto plantado em schema precedente.
-- ---------------------------------------------------------------------
do $do$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'cadex'
       and p.prokind = 'f'
       and (p.proconfig is null
            or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, cadex, extensions', f.sig);
  end loop;
end $do$;

-- ---------------------------------------------------------------------
-- Views públicas com SECURITY DEFINER: deliberado, e aqui está o porquê.
--
-- O linter do Supabase sinaliza `public_companies` e `public_interventions`
-- como views SECURITY DEFINER. É intencional e é o mecanismo da
-- publicação obrigatória do art. 7º, § 2º: o papel `anon` NÃO tem grant
-- em nenhuma tabela, e alcança apenas estas duas views, que já filtram
-- as linhas publicáveis e não contêm dado pessoal algum.
--
-- Trocar por security_invoker exigiria conceder ao `anon` leitura direta
-- de `companies` e `interventions` com policies próprias — isto é, abrir
-- as tabelas para fechá-las de novo por policy. A superfície seria maior,
-- não menor.
-- ---------------------------------------------------------------------
comment on view public_companies is
  'Art. 7o, par. 2o: publicacao obrigatoria da relacao de empresas com CADEX ativo.
   SECURITY DEFINER deliberado: o papel anon nao tem grant em tabela alguma e
   alcanca somente esta view, que ja restringe linhas e colunas publicaveis.';

comment on view public_interventions is
  'Art. 14: publicidade do canteiro. SECURITY DEFINER deliberado, pelo mesmo
   motivo de public_companies. Nao expoe CPF, e-mail, telefone, fotografia nem
   caminho de documento — ha teste que falha se alguma dessas colunas aparecer.';
