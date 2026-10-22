-- =====================================================================
-- Numeração própria por tipo de documento.
--
-- Antes, todos os documentos dividiam um contador único. Agora cada tipo
-- tem a sua sequência. Os números já emitidos são preservados: o contador
-- de cada tipo começa do maior número que ele já usou.
-- =====================================================================

create table public.documentos_numeracao_tipo (
  tipo    text primary key check (tipo in
            ('notificacao', 'auto_infracao', 'embargo', 'apreensao', 'certidao_regularidade', 'termo_compromisso')),
  ultimo  int not null default 0 check (ultimo >= 0)
);

insert into public.documentos_numeracao_tipo (tipo, ultimo)
select t.tipo, coalesce(max(d.numero), 0)
  from (values ('notificacao'), ('auto_infracao'), ('embargo'), ('apreensao'),
               ('certidao_regularidade'), ('termo_compromisso')) as t(tipo)
  left join public.documentos_oficiais d on d.tipo = t.tipo
 group by t.tipo;

alter table public.documentos_numeracao_tipo enable row level security;
revoke all on public.documentos_numeracao_tipo from public, anon, authenticated;

-- O número passa a ser único por tipo, e não mais no conjunto todo.
alter table public.documentos_oficiais drop constraint documentos_oficiais_numero_key;
alter table public.documentos_oficiais add constraint documentos_oficiais_tipo_numero_key unique (tipo, numero);

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

  -- O UPSERT trava a linha do tipo: emissões simultâneas do mesmo tipo não repetem número.
  insert into public.documentos_numeracao_tipo as n (tipo, ultimo) values (p_tipo, 1)
  on conflict (tipo) do update set ultimo = n.ultimo + 1
  returning n.ultimo into v_numero;

  v_codigo := upper(substr(encode(sha256(convert_to(
    concat_ws('|', p_tipo, v_numero, p_empresa_id, v_momento, p_dados::text), 'UTF8')), 'hex'), 1, 12));

  insert into public.documentos_oficiais as d (tipo, numero, empresa_id, dados, emitido_por, emitido_em, codigo_verificacao)
  values (p_tipo, v_numero, p_empresa_id, p_dados, auth.uid(), v_momento, v_codigo)
  returning d.id into v_id;

  return query select v_id, v_numero, v_codigo, v_momento;
end;
$$;
