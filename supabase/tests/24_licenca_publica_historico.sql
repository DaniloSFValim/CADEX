-- =====================================================================
-- Trilha pública: só data e evento, sem quem alterou nem valores internos.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

alter table empresas disable trigger user;
insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
values ('12345678000195', 'Trilha Ltda.', 'terceirizada', 't@trilha.test', '{drenagem}', false, 'deferida', true, 'CADEX-TRL-0001');
alter table empresas enable trigger user;

alter table licencas disable trigger user;
insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, contratante_razao_social,
                      imovel_endereco, protocolo_data, situacao, decisao_data, inicio_previsto, fim_previsto, codigo_publico)
select 'drenagem', 'PROC-TRL-1', array['vala'], 'Obra com trilha', e.id, null, 'Prefeitura Municipal de Niterói', 'Rua Teste, 1', '2026-09-10', 'deferida', '2026-09-12',
       '2026-10-01', '2026-12-31', 'trilhapublica0001'
  from empresas e where e.codigo_cadex = 'CADEX-TRL-0001';
-- Só a auditoria volta: a regra de negócio (licencas_antes_de_gravar) fica de fora, por ser fixture.
alter table licencas enable trigger zz_auditoria;

-- Mudança de situação passa pela auditoria: a trilha ganha um evento.
update licencas set situacao = 'cancelada' where codigo_publico = 'trilhapublica0001';

do $$
declare
  j jsonb := public.licenca_publica_historico('trilhapublica0001');
begin
  perform pg_temp.assert(jsonb_typeof(j) = 'array', 'trilha não devolveu uma lista');
  perform pg_temp.assert(j::text like '%Cancelada%', 'a mudança de situação não entrou na trilha');
  perform pg_temp.assert(j::text not like '%por_nome%' and j::text not like '%antes%' and j::text not like '%depois%'
                         and j::text not like '%trilha@%' and j::text not like '%registro_id%',
    'a trilha vazou campo interno');
  perform pg_temp.assert(coalesce((select bool_and(e ? 'data' and e ? 'evento'
                                                   and (select count(*) from jsonb_object_keys(e)) = 2)
                                     from jsonb_array_elements(j) e), false),
    'evento com campos fora de data e evento');

  perform pg_temp.assert(public.licenca_publica_historico('000000000000000000000000') = '[]'::jsonb,
    'código inexistente devolveu trilha');
  perform pg_temp.assert(public.licenca_publica_historico(upper('trilhapublica0001')) is not null,
    'código em maiúsculas não foi aceito');
end $$;

-- Pedido em análise não aparece publicamente
update licencas set situacao = 'em_analise' where codigo_publico = 'trilhapublica0001';
do $$
begin
  perform pg_temp.assert(public.licenca_publica_historico('trilhapublica0001') = '[]'::jsonb,
    'pedido em análise apareceu na trilha pública');
end $$;

do $$
begin
  perform pg_temp.assert(has_function_privilege('anon', 'public.licenca_publica_historico(text)', 'execute'),
    'anônimo sem permissão para a trilha pública');
end $$;

rollback;
select 'trilha pública: OK' as resultado;
