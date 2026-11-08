-- =====================================================================
-- Comunicação prévia de serviço programado ao CISP.
-- Empresa precisa estar ativa; placas são normalizadas e validadas; a
-- comunicação precisa ser feita antes do início previsto.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

do $$
declare ativa_id uuid; inativa_id uuid; n int;
begin
  -- Fixture: as regras de situação das empresas não fazem parte deste teste.
  alter table empresas disable trigger user;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('33000167000101', 'Comunica CSP Ltda.', 'operadora', 'c@csp.test', '{telecom}', true, 'deferida', true, 'CADEX-CSP-0001')
  returning id into ativa_id;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('24144040000175', 'Desativada CSP Ltda.', 'operadora', 'd@csp.test', '{telecom}', true, 'deferida', false, 'CADEX-CSP-0002')
  returning id into inativa_id;

  -- Válido: placas em minúsculas e com hífen viram o padrão.
  insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, tipo_servico, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, comunicado_em)
  values (ativa_id, 'Fulano de Tal', array['abc-1234', 'ABC1D23'], 'Rua A, 10', 'Manutenção de rede', 'Teste', -22.900000, -43.100000,
          current_date + 5, current_date + 7, now());
  select count(*) into n from comunicacoes_servico where empresa_id = ativa_id and placas = array['ABC1234', 'ABC1D23'];
  perform pg_temp.assert(n = 1, 'placas não foram normalizadas');

  -- Placa inválida é recusada.
  begin
    insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, tipo_servico, inicio_lat, inicio_lng, inicio_previsto, fim_previsto)
    values (ativa_id, 'Fulano', array['XYZ'], 'Rua B', 'Serviço', 'Teste', -22.900000, -43.100000, current_date + 5, current_date + 5);
    raise exception 'ASSERT FALHOU: placa inválida foi aceita';
  exception when others then
    if sqlerrm like 'ASSERT FALHOU%' then raise; end if;
  end;

  -- Empresa inativa é recusada.
  begin
    insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, tipo_servico, inicio_lat, inicio_lng, inicio_previsto, fim_previsto)
    values (inativa_id, 'Fulano', array['ABC1234'], 'Rua C', 'Serviço', 'Teste', -22.900000, -43.100000, current_date + 5, current_date + 5);
    raise exception 'ASSERT FALHOU: empresa inativa pôde comunicar';
  exception when others then
    if sqlerrm like 'ASSERT FALHOU%' then raise; end if;
  end;

  -- Comunicação depois do início é recusada.
  begin
    insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, tipo_servico, inicio_lat, inicio_lng, inicio_previsto, fim_previsto, comunicado_em)
    values (ativa_id, 'Fulano', array['ABC1234'], 'Rua D', 'Serviço', 'Teste', -22.900000, -43.100000, current_date - 1, current_date + 3, now());
    raise exception 'ASSERT FALHOU: comunicação tardia foi aceita';
  exception when others then
    if sqlerrm like 'ASSERT FALHOU%' then raise; end if;
  end;

  -- Responsável vazio é recusado pela tabela.
  begin
    insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, tipo_servico, inicio_lat, inicio_lng, inicio_previsto, fim_previsto)
    values (ativa_id, '   ', array['ABC1234'], 'Rua E', 'Serviço', 'Teste', -22.900000, -43.100000, current_date + 5, current_date + 5);
    raise exception 'ASSERT FALHOU: responsável vazio foi aceito';
  exception when others then
    if sqlerrm like 'ASSERT FALHOU%' then raise; end if;
  end;
end $$;

rollback;
