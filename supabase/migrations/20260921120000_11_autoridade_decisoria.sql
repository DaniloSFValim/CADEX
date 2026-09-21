-- =====================================================================
-- CADEX — 11: autoridade decisória e documentos do art. 12
--
-- MOTIVO DESTA MIGRATION
-- As policies de RLS das migrations 04 concedem `for all` ao interessado
-- sobre as linhas da própria intervenção. Isso está certo para os dados
-- que ele declara — e errado para os que registram a decisão da
-- administração, porque a mesma policy que o deixa escrever o escopo da
-- obra o deixa escrever `licenses.status = 'deferida'`.
--
-- A falha foi reproduzida em banco real: uma empresa com CADEX ativo
-- deferiu a própria licença por UPDATE direto, atribuiu-lhe número e
-- vigência, e em seguida iniciou a obra por `start_intervention`, que
-- encontrou uma licença "deferida" e não teve como saber que não havia
-- ato administrativo algum por trás dela. `cadex.approve_license` checa
-- o papel de quem a chama, mas ninguém é obrigado a chamá-la: o PostgREST
-- expõe a tabela, e a tabela é a fonte da verdade.
--
-- A mesma policy permitia ainda:
--   • retroagir `declarations.registered_at`, que é justamente a prova de
--     que o registro antecedeu o deslocamento (art. 17);
--   • lançar `emergencies.concluded_at` no futuro, empurrando o prazo de
--     24 horas do art. 20 para diante;
--   • declarar-se `regularizada` sem protocolo CISP, sem descrição do
--     serviço e sem foto — os três requisitos que a função de
--     regularização exige e que o UPDATE direto ignora.
--
-- PRINCÍPIO ADOTADO
-- O interessado escreve o que ele declara. Quem lavra o que a
-- administração decide é a administração — e, onde o próprio interessado
-- pratica o ato (iniciar a obra licenciada, regularizar a emergência), o
-- registro é carimbado pelo servidor, não aceito do cliente.
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- Contexto sem usuário final: migration, seed e agendamento.
--
-- Toda escrita vinda do interessado chega pelo PostgREST com um JWT, e
-- portanto com `auth.uid()` preenchido. Quando não há uid, quem está
-- agindo é o próprio banco — a varredura de prazos (`run_deadline_sweep`,
-- que precisa marcar licença vencida), uma migration ou a carga de
-- demonstração. O papel `anon` também não tem uid, mas migration 10 lhe
-- retirou todo acesso a estas tabelas e a RLS o barraria de qualquer
-- forma; `supabase/tests/06_autoridade_decisoria.sql` prova isso.
-- ---------------------------------------------------------------------
create or replace function cadex.acting_without_user()
returns boolean language sql stable
set search_path = public, cadex, extensions as $$
  select auth.uid() is null;
$$;

comment on function cadex.acting_without_user() is
  'Verdadeiro quando não há usuário autenticado — migration, seed ou varredura agendada.';

-- =====================================================================
-- PARTE 1 — LICENÇA: o deferimento é ato da SECONSER (art. 13)
-- =====================================================================

create or replace function cadex.next_license_protocol_number()
returns text language sql
set search_path = public, cadex, extensions as $$
  select 'PL-' || to_char(current_date,'YYYYMMDD') || '-' ||
         lpad((nextval('license_number_seq'))::text, 6, '0');
$$;

-- Número de protocolo e prazo de análise são atribuídos pelo sistema.
-- O `coalesce` original preservava um valor vindo do cliente, o que
-- permitia ao requerente escolher o próprio número de protocolo.
create or replace function cadex.set_license_analysis_due()
returns trigger language plpgsql
set search_path = public, cadex, extensions as $$
begin
  if new.status = 'protocolada' and old.status is distinct from 'protocolada' then
    new.protocolled_at := case
      when cadex.is_staff() or cadex.acting_without_user()
        then coalesce(new.protocolled_at, now())
      else now()
    end;
    new.analysis_due_date := cadex.add_business_days(
      current_date, coalesce(cadex.param_int('license.analysis_business_days'), 20));
    new.protocol_number := case
      when cadex.is_staff() or cadex.acting_without_user()
        then coalesce(new.protocol_number, cadex.next_license_protocol_number())
      else cadex.next_license_protocol_number()
    end;
  end if;
  return new;
end;
$$;

-- Transições que o requerente pratica por direito próprio:
--   rascunho     → protocolada   pedido (art. 11)
--   rascunho     → cancelada     desistência antes do protocolo
--   deferida     → em_execucao   início da obra, por start_intervention
--   em_execucao  → concluida     encerramento da obra
-- Todas as demais são ato administrativo.
create or replace function cadex.enforce_license_authority()
returns trigger language plpgsql
set search_path = public, cadex, extensions as $$
begin
  if cadex.is_staff() or cadex.acting_without_user() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then
      raise exception
        'Pedido de licença nasce como rascunho; protocolar é ato posterior (art. 11).';
    end if;
    -- O requerente não lavra a decisão nem a licença emitida.
    new.protocol_number   := null;
    new.license_number    := null;
    new.analysis_due_date := null;
    new.protocolled_at    := null;
    new.decided_at        := null;
    new.decided_by        := null;
    new.decision_note     := null;
    new.issued_at         := null;
    new.valid_from        := null;
    new.valid_until       := null;
    return new;
  end if;

  if new.status is distinct from old.status
     and not (
       (old.status = 'rascunho'    and new.status in ('protocolada','cancelada'))
       or (old.status = 'deferida'    and new.status = 'em_execucao')
       or (old.status = 'em_execucao' and new.status = 'concluida')
     ) then
    raise exception
      'Passar a licença de % para % é ato da SECONSER (art. 13); o requerente não o pratica.',
      old.status, new.status;
  end if;

  if new.license_number  is distinct from old.license_number
     or new.decided_at   is distinct from old.decided_at
     or new.decided_by   is distinct from old.decided_by
     or new.decision_note is distinct from old.decision_note
     or new.issued_at    is distinct from old.issued_at
     or new.valid_from   is distinct from old.valid_from
     or new.valid_until  is distinct from old.valid_until then
    raise exception
      'Número, decisão e vigência da licença são lavrados pela SECONSER (art. 13).';
  end if;

  -- Protocolo e prazo de análise pertencem ao sistema. Na passagem a
  -- PROTOCOLADA quem os escreve é `set_license_analysis_due`; fora dela,
  -- ninguém os move — o que também impede reabrir o prazo do art. 13.
  if not (old.status = 'rascunho' and new.status = 'protocolada')
     and (new.protocol_number   is distinct from old.protocol_number
          or new.protocolled_at    is distinct from old.protocolled_at
          or new.analysis_due_date is distinct from old.analysis_due_date) then
    raise exception
      'Número de protocolo e prazo de análise são atribuídos pelo sistema (art. 13).';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_license_authority on licenses;
create trigger trg_license_authority
  before insert or update on licenses
  for each row execute function cadex.enforce_license_authority();

-- ---------------------------------------------------------------------
-- Art. 12 — "O pedido de licença será instruído com planta de locação,
-- cronograma físico e ART ou RRT específica."
--
-- Era o único ponto do Capítulo III que a matriz de conformidade marcava
-- como parcial: o catálogo `license_documents.kind` previa os três tipos,
-- mas nada impedia protocolar sem eles. A exigência é do protocolo, não
-- do rascunho — o requerente monta o pedido aos poucos.
-- ---------------------------------------------------------------------
create or replace function cadex.check_license_instruction()
returns trigger language plpgsql
set search_path = public, cadex, extensions as $$
declare
  v_missing text[];
  v_label   jsonb := jsonb_build_object(
    'planta_locacao',    'planta de locação',
    'cronograma_fisico', 'cronograma físico',
    'art_rrt',           'ART ou RRT específica');
begin
  if new.status = 'protocolada' and old.status is distinct from 'protocolada' then
    select array_agg(v_label->>k order by k)
      into v_missing
      from unnest(array['planta_locacao','cronograma_fisico','art_rrt']) as k
     where not exists (
       select 1 from license_documents ld
        where ld.license_id = new.id and ld.kind = k);

    if v_missing is not null then
      raise exception
        'O pedido de licença deve ser instruído com % (art. 12).',
        array_to_string(v_missing, ', ');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_license_instruction on licenses;
create trigger trg_license_instruction
  before update on licenses
  for each row execute function cadex.check_license_instruction();

comment on function cadex.check_license_instruction() is
  'Art. 12: recusa protocolo sem planta de locação, cronograma físico e ART/RRT específica.';

-- =====================================================================
-- PARTE 2 — AUTODECLARAÇÃO: o registro é carimbado pelo servidor
-- =====================================================================
-- Art. 17 exige que o registro do cronograma georreferenciado anteceda o
-- deslocamento. A verificação existente comparava `dispatched_at` com
-- `registered_at`, mas ambos vinham do cliente: bastava retroagir o
-- registro para que qualquer deslocamento parecesse regular. O horário do
-- registro passa a ser o do servidor.
create or replace function cadex.check_declaration_order()
returns trigger language plpgsql
set search_path = public, cadex, extensions as $$
declare
  v_system boolean := cadex.is_staff() or cadex.acting_without_user();
begin
  if new.status = 'registrada'
     and (tg_op = 'INSERT' or old.status is distinct from 'registrada') then
    new.registered_at := case
      when v_system then coalesce(new.registered_at, now())
      else now()
    end;
  elsif tg_op = 'UPDATE'
        and not v_system
        and new.registered_at is distinct from old.registered_at then
    raise exception
      'O horário do registro da autodeclaração é lavrado pelo sistema (art. 17).';
  end if;

  if new.dispatched_at is not null then
    if new.registered_at is null then
      raise exception 'Autodeclaração precisa ser registrada antes do deslocamento (§16).';
    end if;
    if new.dispatched_at < new.registered_at then
      raise exception 'Deslocamento (%) anterior ao registro (%) — vedado pelo §16.',
        new.dispatched_at, new.registered_at;
    end if;
  end if;

  if new.status = 'registrada' and new.declaration_number is null then
    new.declaration_number := 'AUT-' || to_char(current_date,'YYYY') || '-' ||
      lpad(nextval('declaration_number_seq')::text, 6, '0');
  elsif tg_op = 'UPDATE'
        and not v_system
        and new.declaration_number is distinct from old.declaration_number then
    raise exception 'O número da autodeclaração é atribuído pelo sistema (art. 17).';
  end if;

  return new;
end;
$$;

-- =====================================================================
-- PARTE 3 — EMERGÊNCIA: conclusão e regularização (art. 20)
-- =====================================================================

-- A conclusão do atendimento é o termo inicial das 24 horas. Lançá-la no
-- futuro adia o prazo; lançá-la antes do deslocamento é impossível no
-- mundo. Vale para todos os papéis: é regra de integridade, não de
-- competência.
create or replace function cadex.check_emergency_timeline()
returns trigger language plpgsql
set search_path = public, cadex, extensions as $$
begin
  if new.concluded_at is not null then
    if new.concluded_at > now() + interval '1 minute' then
      raise exception
        'A conclusão do atendimento não pode ser lançada no futuro — é o termo inicial das 24 horas do art. 20.';
    end if;
    if new.dispatched_at is not null and new.concluded_at < new.dispatched_at then
      raise exception 'Conclusão (%) anterior ao deslocamento (%).',
        new.concluded_at, new.dispatched_at;
    end if;
  end if;
  if new.arrived_at is not null and new.dispatched_at is not null
     and new.arrived_at < new.dispatched_at then
    raise exception 'Chegada (%) anterior ao deslocamento (%).',
      new.arrived_at, new.dispatched_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_emergency_timeline on emergencies;
create trigger trg_emergency_timeline
  before insert or update on emergencies
  for each row execute function cadex.check_emergency_timeline();

-- A regularização do art. 20 só se prova por `cadex.regularize_emergency`,
-- que exige protocolo CISP, descrição do serviço executado e registro
-- fotográfico, e que decide sozinha se o prazo foi cumprido. Por UPDATE
-- direto o interessado se declarava `regularizada` sem nenhum dos três e
-- ainda escapava do `fora_do_prazo`.
create or replace function cadex.enforce_emergency_authority()
returns trigger language plpgsql
set search_path = public, cadex, extensions as $$
begin
  if cadex.is_staff() or cadex.acting_without_user() then
    return new;
  end if;
  if coalesce(current_setting('cadex.regularizing', true), '') = '1' then
    return new;
  end if;

  if new.status is distinct from old.status
     and new.status in ('regularizada','fora_do_prazo','encerrada') then
    raise exception
      'A regularização do art. 20 é registrada por regularize_emergency, que exige protocolo CISP, serviço executado e foto.';
  end if;
  if new.regularized_at is distinct from old.regularized_at then
    raise exception 'O horário da regularização é lavrado pelo sistema (art. 20).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_emergency_authority on emergencies;
create trigger trg_emergency_authority
  before update on emergencies
  for each row execute function cadex.enforce_emergency_authority();

-- A função marca a transação como sendo o ato de regularizar. O sinal é
-- local à transação e não há como o cliente PostgREST emiti-lo: `set_config`
-- vive em `pg_catalog`, que não é schema exposto.
--
-- Abaixo está a versão da migration 07 — a que conta o prazo da conclusão
-- do atendimento — acrescida apenas do sinal e da restrição de quem pode
-- praticar o ato. As mensagens são as da 07, e o teste
-- `02_intervention_rules.sql` as fixa.
create or replace function cadex.regularize_emergency(p_emergency_id uuid)
returns emergencies language plpgsql security definer
set search_path = public, cadex, extensions as $$
declare e emergencies%rowtype;
begin
  select * into e from emergencies where id = p_emergency_id for update;
  if not found then raise exception 'Emergência não encontrada.'; end if;

  if not (cadex.acting_without_user()
          or cadex.is_staff()
          or exists (select 1 from interventions i
                      where i.id = e.intervention_id
                        and cadex.current_company_id()
                            in (i.executor_id, i.subcontractor_id))) then
    raise exception
      'A regularização é registrada pela empresa executora ou pela fiscalização (art. 20).';
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

  perform set_config('cadex.regularizing', '1', true);
  update emergencies
     set regularized_at = now(),
         status = case
           when now() > e.regularization_due_at then 'fora_do_prazo'::emergency_status
           else 'regularizada'::emergency_status end
   where id = p_emergency_id
   returning * into e;
  perform set_config('cadex.regularizing', '0', true);
  return e;
end;
$$;

-- A varredura de prazos marca licença vencida e emergência fora do prazo.
-- Roda como `service_role` no agendamento, sem usuário final, e por isso
-- passa pelos guardas acima por `acting_without_user`.

-- =====================================================================
-- PARTE 4 — consulta de empresa habilitada por CNPJ (art. 7º, § 2º)
-- =====================================================================
-- O art. 11 exige nomear contratante, executora e subcontratada. A RLS
-- impede uma empresa de ler o cadastro de outra, e `public_companies`
-- publica a relação de habilitadas sem o identificador interno — sem o
-- qual não há como preencher `concessionaire_id` nem `subcontractor_id`.
-- Esta função devolve exatamente o que a view já publica, mais o `id`,
-- e apenas para quem consultar o CNPJ exato de uma empresa habilitada.
create or replace function public.find_active_company_rpc(p_cnpj text)
returns table (
  id uuid, cnpj text, legal_name text, trade_name text,
  cadex_number text, status cadex_status, valid_until date)
language sql stable security definer
set search_path = public, cadex, extensions as $$
  select c.id, c.cnpj, c.legal_name, c.trade_name,
         c.cadex_number, c.status, c.valid_until
    from companies c
   where c.cnpj = regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g')
     and c.status in ('ativo','proximo_vencimento');
$$;

comment on function public.find_active_company_rpc(text) is
  'Art. 7º, § 2º c/c art. 11: resolve CNPJ de empresa habilitada em identificador, para nomear as partes da intervenção.';

revoke execute on function public.find_active_company_rpc(text) from public;
revoke execute on function public.find_active_company_rpc(text) from anon;
grant  execute on function public.find_active_company_rpc(text) to authenticated;

-- ---------------------------------------------------------------------
-- Fundamento normativo das regras acima, para a matriz de conformidade.
-- ---------------------------------------------------------------------
insert into system_parameters (key, value, description, unit, legal_basis) values
  ('license.required_documents',
   '{"value":["planta_locacao","cronograma_fisico","art_rrt"]}'::jsonb,
   'Documentos que instruem o pedido de licença', 'lista',
   'Art. 12 da Resolução Conjunta SECONSER/SEOP nº 001/2026')
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      legal_basis = excluded.legal_basis;
