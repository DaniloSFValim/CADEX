-- =====================================================================
-- Verificação pública de documento pelo código (QR Code do PDF).
--
-- Devolve só o mínimo para conferir a autenticidade: tipo, número, data de
-- emissão, empresa e a situação atual da inscrição. Não expõe representante,
-- responsáveis técnicos, fiscal, nem o conteúdo do documento.
-- =====================================================================

create or replace function public.verificar_documento(p_codigo text)
returns table (tipo text, numero int, emitido_em timestamptz, razao_social text, codigo_cadex text,
               situacao_atual text, validade_ate date)
language sql stable security definer
set search_path = public as $$
  select d.tipo, d.numero, d.emitido_em, e.razao_social, e.codigo_cadex,
         public.situacao_efetiva(e.situacao, e.validade_ate), e.validade_ate
    from public.documentos_oficiais d
    join public.empresas e on e.id = d.empresa_id
   where upper(d.codigo_verificacao) = upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'))
   limit 1;
$$;

revoke execute on function public.verificar_documento(text) from public;
grant execute on function public.verificar_documento(text) to anon, authenticated;
