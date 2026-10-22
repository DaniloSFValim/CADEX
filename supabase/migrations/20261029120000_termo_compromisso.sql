-- =====================================================================
-- Termo de compromisso e responsabilidade (cadastro CADEX).
--
-- O termo leva o registro completo da empresa e é assinado pelo representante
-- legal. Entra no mesmo fluxo de emissão: numeração própria, registro imutável
-- e código de verificação. Só a SECONSER emite, como nos demais documentos.
-- =====================================================================

alter table public.documentos_oficiais drop constraint documentos_oficiais_tipo_check;
alter table public.documentos_oficiais add constraint documentos_oficiais_tipo_check
  check (tipo in ('notificacao', 'auto_infracao', 'embargo', 'apreensao', 'certidao_regularidade', 'termo_compromisso'));

create or replace function public.emitir_documento(p_tipo text, p_empresa_id uuid, p_dados jsonb)
returns table (id uuid, numero int, codigo_verificacao text, emitido_em timestamptz)
language plpgsql security definer
set search_path = public as $$
declare
  v_numero int;
  v_momento timestamptz := now();
  v_codigo text;
  v_id uuid;
begin
  if not public.is_gestor() then
    raise exception 'Só a SECONSER emite documentos oficiais.' using errcode = '42501';
  end if;
  if p_tipo not in ('notificacao', 'auto_infracao', 'embargo', 'apreensao', 'certidao_regularidade', 'termo_compromisso') then
    raise exception 'Tipo de documento desconhecido.' using errcode = '22023';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Os dados do documento devem ser um objeto.' using errcode = '22023';
  end if;
  if pg_column_size(p_dados) > 65536 then
    raise exception 'Dados do documento grandes demais.' using errcode = '22001';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id) then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;

  -- O UPDATE trava a linha: emissões simultâneas não repetem número.
  update public.documentos_numeracao set ultimo = ultimo + 1 where documentos_numeracao.id = 1
    returning documentos_numeracao.ultimo into v_numero;

  v_codigo := upper(substr(encode(sha256(convert_to(
    concat_ws('|', v_numero, p_tipo, p_empresa_id, v_momento, p_dados::text), 'UTF8')), 'hex'), 1, 12));

  insert into public.documentos_oficiais as d (tipo, numero, empresa_id, dados, emitido_por, emitido_em, codigo_verificacao)
  values (p_tipo, v_numero, p_empresa_id, p_dados, auth.uid(), v_momento, v_codigo)
  returning d.id into v_id;

  return query select v_id, v_numero, v_codigo, v_momento;
end;
$$;
