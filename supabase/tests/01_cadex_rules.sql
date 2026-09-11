-- =====================================================================
-- Testes — CADEX: validação, workflow, validade e inaptidão (§6–§9, §45)
-- Cada bloco falha com exception se a regra não for aplicada.
-- Roda em transação e faz rollback: não polui o banco.
-- =====================================================================
begin;

create or replace function assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

-- --- CNPJ é validado de verdade, não por máscara ----------------------
select assert(cadex.is_valid_cnpj('34028316000103'), 'CNPJ válido rejeitado');
select assert(not cadex.is_valid_cnpj('11111111111111'), 'CNPJ repetido aceito');
select assert(not cadex.is_valid_cnpj('34028316000104'), 'CNPJ com DV errado aceito');
select assert(not cadex.is_valid_cnpj('123'), 'CNPJ curto aceito');

do $$
begin
  begin
    insert into companies (cnpj, legal_name, email)
    values ('00000000000000', 'X', 'x@x.local');
    raise exception 'ASSERT FALHOU: banco aceitou CNPJ inválido';
  exception when check_violation then null;
  end;
end $$;

-- --- Ciclo de vida do cadastro ---------------------------------------
do $$
declare cid uuid; dt uuid; docid uuid; st cadex_status;
begin
  insert into companies (cnpj, legal_name, email, status)
  values ('11222333000181', 'Teste Ltda', 't@t.local', 'em_analise')
  returning id into cid;

  select id into dt from document_types where code = 'CND_FEDERAL';

  insert into company_documents (company_id, document_type_id, status, valid_until,
                                 storage_path, file_name, file_size, mime_type)
  values (cid, dt, 'aprovado', current_date + 200, 'p/1.pdf','1.pdf',10,'application/pdf')
  returning id into docid;

  -- Deferimento exige papel: sem login deve falhar (§5)
  perform set_config('cadex.test_user_id','',false);
  begin
    perform cadex.approve_company(cid);
    raise exception 'ASSERT FALHOU: deferimento sem papel foi aceito';
  exception when others then
    if position('Somente Administrador' in sqlerrm) = 0 then raise; end if;
  end;

  -- Com gestor, defere e gera número + validade de 12 meses (§8)
  perform auth.login('00000000-0000-4000-8000-000000000002');
  perform cadex.approve_company(cid, 'ok');
  perform set_config('cadex.test_user_id','',false);

  select status into st from companies where id = cid;
  perform assert(st = 'ativo', 'status após deferimento deveria ser ativo, veio ' || st);
  perform assert((select cadex_number from companies where id = cid) is not null,
                 'número CADEX não gerado');
  perform assert((select valid_until from companies where id = cid)
                 = (current_date + interval '12 months')::date,
                 'validade não é de 12 meses');
  perform assert(cadex.is_company_active(cid), 'empresa deferida não está ativa');

  -- Documento vence -> empresa vai a PENDENTE e abre prazo de saneamento (§9)
  update company_documents set valid_until = current_date - 1 where id = docid;
  st := cadex.refresh_company_status(cid);
  perform assert(st = 'pendente', 'documento vencido deveria gerar PENDENTE, veio ' || st);
  perform assert((select status from company_documents where id = docid) = 'vencido',
                 'documento não foi marcado como vencido');
  perform assert((select remediation_due_date from companies where id = cid) is not null,
                 'prazo de saneamento não foi aberto');

  -- Passado o saneamento -> INAPTA (§9)
  update companies set remediation_due_date = current_date - 1 where id = cid;
  st := cadex.refresh_company_status(cid);
  perform assert(st = 'inapto', 'após saneamento vencido deveria ser inapto, veio ' || st);
  perform assert(not cadex.is_company_active(cid), 'empresa inapta consta como ativa');

  -- Alerta de proximidade do vencimento
  update company_documents set valid_until = current_date + 300, status='aprovado' where id = docid;
  update companies set status = 'ativo', remediation_due_date = null,
         valid_until = current_date + 10 where id = cid;
  st := cadex.refresh_company_status(cid);
  perform assert(st = 'proximo_vencimento',
                 'deveria sinalizar proximo_vencimento, veio ' || st);

  -- CADEX vencido -> inapto
  update companies set valid_until = current_date - 1 where id = cid;
  st := cadex.refresh_company_status(cid);
  perform assert(st = 'inapto', 'CADEX vencido deveria ser inapto, veio ' || st);
end $$;

-- --- Deferimento bloqueado com documento pendente (§8) ----------------
do $$
declare cid uuid; dt uuid;
begin
  insert into companies (cnpj, legal_name, email, status)
  values ('19131243000197', 'Pendente Ltda', 'p@p.local', 'em_analise')
  returning id into cid;
  select id into dt from document_types where code = 'CNDT';
  insert into company_documents (company_id, document_type_id, status,
                                 storage_path, file_name, file_size, mime_type)
  values (cid, dt, 'rejeitado', 'p/2.pdf','2.pdf',10,'application/pdf');

  perform auth.login('00000000-0000-4000-8000-000000000002');
  begin
    perform cadex.approve_company(cid);
    raise exception 'ASSERT FALHOU: deferiu com documento rejeitado';
  exception when others then
    if position('documentos pendentes' in sqlerrm) = 0 then raise; end if;
  end;
  perform set_config('cadex.test_user_id','',false);
end $$;

-- --- Cadeia de subcontratação e proibição de ciclo (§10) --------------
do $$
declare a uuid; b uuid; c uuid; n int;
begin
  insert into companies (cnpj, legal_name, email) values
    ('05570714000159','A Ltda','a@a.local') returning id into a;
  insert into companies (cnpj, legal_name, email) values
    ('07526557000100','B Ltda','b@b.local') returning id into b;
  insert into companies (cnpj, legal_name, email) values
    ('02558157000162','C Ltda','c@c.local') returning id into c;

  insert into company_relationships (parent_id, child_id, relation)
  values (a,b,'subcontratacao'), (b,c,'subcontratacao');

  select count(*) into n from cadex.subcontracting_chain(a);
  perform assert(n = 2, 'cadeia deveria ter profundidade 2, veio ' || n);
  perform assert(exists (select 1 from cadex.subcontracting_chain(a)
                         where company_id = c and depth = 2),
                 'subcontratada da subcontratada não apareceu na cadeia');

  begin
    insert into company_relationships (parent_id, child_id, relation)
    values (c, a, 'subcontratacao');
    raise exception 'ASSERT FALHOU: ciclo de subcontratação aceito';
  exception when others then
    if position('Ciclo' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- --- Dias úteis respeitam feriado persistido (§31) --------------------
do $$
declare d date;
begin
  delete from holidays where name = 'TESTE';
  -- 2026-03-02 é segunda-feira.
  d := cadex.add_business_days(date '2026-03-02', 3);
  perform assert(d = date '2026-03-05', 'sem feriado deveria cair em 05/03, veio ' || d);

  insert into holidays (date, name) values (date '2026-03-04','TESTE');
  d := cadex.add_business_days(date '2026-03-02', 3);
  perform assert(d = date '2026-03-06', 'com feriado deveria cair em 06/03, veio ' || d);

  -- Fim de semana é pulado
  d := cadex.add_business_days(date '2026-03-06', 1);
  perform assert(d = date '2026-03-09', 'sexta + 1 dia útil deveria ser segunda, veio ' || d);
end $$;

-- --- Auditoria é imutável (§33) --------------------------------------
do $$
declare n_before bigint; n_after bigint; cid uuid;
begin
  select count(*) into n_before from audit_logs;
  insert into companies (cnpj, legal_name, email)
  values ('03995515000167','Audit Ltda','au@a.local') returning id into cid;
  select count(*) into n_after from audit_logs;
  perform assert(n_after > n_before, 'INSERT em companies não gerou log de auditoria');

  begin
    update audit_logs set note = 'adulterado' where id = (select max(id) from audit_logs);
    raise exception 'ASSERT FALHOU: log de auditoria pôde ser alterado';
  exception when others then
    if position('imutáveis' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from audit_logs where id = (select max(id) from audit_logs);
    raise exception 'ASSERT FALHOU: log de auditoria pôde ser apagado';
  exception when others then
    if position('imutáveis' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

rollback;
