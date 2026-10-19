-- =====================================================================
-- CADEX — documentos oficiais da fiscalização de serviços concedidos
--
-- Notificação, auto de infração, embargo, apreensão e certidão de
-- regularidade. Emissão só pelo gestor (SECONSER), por função que atribui
-- o número na sequência própria da fiscalização ("NNN - SFSC"): sem
-- repetição e sem buracos, mesmo com emissões simultâneas.
--
-- O registro é imutável: não há UPDATE nem DELETE. Correção gera novo
-- documento. O código de verificação é um resumo SHA-256 do conteúdo
-- emitido, recalculável a partir do registro.
--
-- Do CADEX vêm só os dados cadastrais da empresa. Local, descrição,
-- valores, prazos e texto são digitados pelo fiscal no documento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Numeração: uma única sequência para todos os tipos (o modelo usa
-- "Documento nº 001 - SFSC" no mesmo espaço numérico).
-- ---------------------------------------------------------------------
create table public.documentos_numeracao (
  id    int primary key default 1 check (id = 1),
  ultimo int not null default 0 check (ultimo >= 0)
);

insert into public.documentos_numeracao (id, ultimo) values (1, 0);

alter table public.documentos_numeracao enable row level security;
revoke all on public.documentos_numeracao from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Documentos emitidos
-- ---------------------------------------------------------------------
create table public.documentos_oficiais (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in
                      ('notificacao', 'auto_infracao', 'embargo', 'apreensao', 'certidao_regularidade')),
  numero            int  not null unique check (numero > 0),
  empresa_id        uuid not null references public.empresas (id),
  dados             jsonb not null check (jsonb_typeof(dados) = 'object'),
  emitido_por       uuid not null references auth.users (id),
  emitido_em        timestamptz not null,
  codigo_verificacao text not null unique
);

create index documentos_oficiais_empresa_idx on public.documentos_oficiais (empresa_id, emitido_em desc);

alter table public.documentos_oficiais enable row level security;

create policy documentos_oficiais_ler on public.documentos_oficiais
  for select to authenticated
  using (public.is_gestor());

revoke all on public.documentos_oficiais from public, anon, authenticated;
grant select on public.documentos_oficiais to authenticated;

-- Auditoria: emissão fica registrada na empresa do documento.
create trigger zz_auditoria after insert on public.documentos_oficiais
  for each row execute function public.registrar_auditoria();

-- Nenhum registro é alterado nem apagado depois de emitido.
create or replace function public.documento_imutavel()
returns trigger language plpgsql
set search_path = public as $$
begin
  raise exception 'Documento oficial emitido não pode ser alterado nem apagado.';
end;
$$;

revoke execute on function public.documento_imutavel() from public, anon, authenticated;

create trigger documentos_oficiais_sem_alterar
  before update or delete on public.documentos_oficiais
  for each row execute function public.documento_imutavel();

-- ---------------------------------------------------------------------
-- Emissão: única porta de entrada. Atribui o número e grava o registro.
-- ---------------------------------------------------------------------
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
  if p_tipo not in ('notificacao', 'auto_infracao', 'embargo', 'apreensao', 'certidao_regularidade') then
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

revoke execute on function public.emitir_documento(text, uuid, jsonb) from public, anon;
grant  execute on function public.emitir_documento(text, uuid, jsonb) to authenticated;
