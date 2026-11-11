-- =====================================================================
-- CADEX — verificação pública de documento não responde para empresa de
-- teste. Documento emitido à empresa de teste (para testes internos) não
-- deve ser confirmado por código público, como não aparece na consulta.
--
-- Reversão: recriar verificar_documento sem o filtro "not e.teste"
-- (versão de 20261029150000_verificacao_documento.sql).
-- =====================================================================
create or replace function public.verificar_documento(p_codigo text)
returns table (tipo text, numero integer, emitido_em timestamptz, razao_social text, codigo_cadex text,
               situacao_atual text, validade_ate date)
language sql stable security definer
set search_path = public
as $$
  select d.tipo, d.numero, d.emitido_em, e.razao_social, e.codigo_cadex,
         public.situacao_efetiva(e.situacao, e.validade_ate), e.validade_ate
    from public.documentos_oficiais d
    join public.empresas e on e.id = d.empresa_id and not e.teste
   where upper(d.codigo_verificacao) = upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'))
   limit 1;
$$;
