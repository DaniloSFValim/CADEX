-- =====================================================================
-- CADEX — registro de alterações
--
-- Toda inclusão, alteração e exclusão nas tabelas do cadastro fica
-- registrada: quem fez, quando, e o valor antes e depois. Na alteração,
-- guarda só os campos que mudaram.
--
-- O registro não tem chave estrangeira para a empresa nem para o
-- usuário: excluir uma empresa ou tirar o acesso de um servidor não
-- apaga o que foi registrado. Ninguém grava nem apaga pela API; só os
-- gatilhos escrevem aqui. Só o gestor lê, porque os valores incluem
-- dados dos documentos e CPFs.
-- =====================================================================

create table public.auditoria (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  por         uuid,            -- vazio: alteração feita direto no banco (SQL Editor)
  por_nome    text,            -- nome do servidor no momento da alteração
  tabela      text not null,
  registro_id uuid,
  empresas    uuid[] not null default '{}',  -- empresas afetadas (o vínculo afeta duas)
  operacao    text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  antes       jsonb,
  depois      jsonb
);

create index auditoria_empresas_idx on public.auditoria using gin (empresas);
create index auditoria_em_idx on public.auditoria (em desc);

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_antes  jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_linha  jsonb := coalesce(v_depois, v_antes);
  v_chave  text;
begin
  if tg_op = 'UPDATE' then
    for v_chave in select jsonb_object_keys(to_jsonb(new)) loop
      if v_antes -> v_chave is not distinct from v_depois -> v_chave or v_chave = 'atualizado_em' then
        v_antes  := v_antes  - v_chave;
        v_depois := v_depois - v_chave;
      end if;
    end loop;
    if v_depois = '{}'::jsonb then
      return null;  -- nada mudou de fato
    end if;
  end if;

  insert into public.auditoria (por, por_nome, tabela, registro_id, empresas, operacao, antes, depois)
  values (
    auth.uid(),
    (select nome from public.servidores where user_id = auth.uid()),
    tg_table_name,
    coalesce(v_linha ->> 'id', v_linha ->> 'user_id')::uuid,
    case tg_table_name
      when 'empresas'   then array[(v_linha ->> 'id')::uuid]
      when 'vinculos'   then array[(v_linha ->> 'contratante_id')::uuid, (v_linha ->> 'contratada_id')::uuid]
      when 'servidores' then '{}'::uuid[]
      else array[(v_linha ->> 'empresa_id')::uuid]
    end,
    tg_op, v_antes, v_depois);
  return null;
end;
$$;

revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

create trigger zz_auditoria after insert or update or delete on public.empresas
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update or delete on public.documentos
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update or delete on public.vinculos
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update or delete on public.responsaveis_tecnicos
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update or delete on public.funcionarios
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update or delete on public.veiculos
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update or delete on public.servidores
  for each row execute function public.registrar_auditoria();

alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
create policy auditoria_gestor on public.auditoria for select to authenticated using (public.is_gestor());
