-- =====================================================================
-- Tipo "detentora": código CADEX próprio, setor telecom e documentos
-- próprios (Carta de Compartilhamento ou de Anuência, em lugar da outorga).
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

do $$
declare det uuid; v_codigo text; setores_det text[]; n int;
begin
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa)
  values ('33000167000101', 'Detentora Ltda.', 'detentora', 'd@det42.test', '{}', true, 'em_analise', true)
  returning id, codigo_cadex, setores into det, v_codigo, setores_det;

  perform pg_temp.assert(v_codigo like 'CADEX-DET-%', 'código da detentora não usa o prefixo DET');
  perform pg_temp.assert(setores_det = array['telecom'], 'detentora deveria atuar só em telecom');

  -- A carta é exigida da detentora; a declaração da Anatel e o contrato de compartilhamento não.
  select count(*) into n from tipos_documento
   where codigo = 'CARTA_COMPART' and obrigatorio and 'detentora' = any(perfis);
  perform pg_temp.assert(n = 1, 'a carta não é exigida da detentora');
  select count(*) into n from tipos_documento
   where codigo in ('DECL_REGULADOR', 'CONTRATO_COMPART') and 'detentora' = any(perfis);
  perform pg_temp.assert(n = 0, 'a detentora não deveria exigir a declaração da Anatel nem o contrato');

  -- Os documentos gerais de telecom continuam valendo.
  select count(*) into n from tipos_documento
   where codigo = 'CNPJ_CARD' and 'detentora' = any(perfis);
  perform pg_temp.assert(n = 1, 'o cartão CNPJ deveria valer para a detentora');
end $$;

rollback;
