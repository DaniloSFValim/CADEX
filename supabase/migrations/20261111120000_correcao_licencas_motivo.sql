-- =====================================================================
-- Correção em lote com motivo obrigatório. Cada licença alterada gera
-- uma linha em licencas_correcoes (antes, depois, motivo, quem e quando).
-- Só o administrador lê essa tabela; ninguém grava nela direto: só a função.
-- =====================================================================

create table if not exists public.licencas_correcoes (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  por         uuid not null default auth.uid(),
  licenca_id  uuid references public.licencas (id) on delete set null,
  motivo      text not null check (length(btrim(motivo)) >= 10),
  antes       jsonb not null,
  depois      jsonb not null
);

create index if not exists licencas_correcoes_licenca_idx on public.licencas_correcoes (licenca_id);
create index if not exists licencas_correcoes_em_idx on public.licencas_correcoes (em desc);

alter table public.licencas_correcoes enable row level security;

drop policy if exists licencas_correcoes_ler on public.licencas_correcoes;
create policy licencas_correcoes_ler on public.licencas_correcoes
  for select to authenticated using (public.is_administrador());

revoke all on public.licencas_correcoes from public, anon, authenticated;
grant select on public.licencas_correcoes to authenticated;

-- Substitui a versão de uma só entrada: agora exige o motivo.
drop function if exists public.admin_corrigir_licencas(jsonb);

create or replace function public.admin_corrigir_licencas(p_correcoes jsonb, p_motivo text)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_item   jsonb;
  v_id     uuid;
  v_numero text;
  v_sei    text;
  v_alvo   public.licencas%rowtype;
  v_total  integer := 0;
  v_ordem  integer := 0;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not public.is_administrador() then
    raise exception 'Só o administrador corrige licenças em lote.';
  end if;
  if length(v_motivo) < 10 then
    raise exception 'Informe o motivo da correção (ao menos 10 caracteres).';
  end if;
  if p_correcoes is null or jsonb_typeof(p_correcoes) <> 'array' or jsonb_array_length(p_correcoes) = 0 then
    raise exception 'Nenhuma correção informada.';
  end if;
  if jsonb_array_length(p_correcoes) > 200 then
    raise exception 'No máximo 200 correções por vez.';
  end if;

  for v_item in select value from jsonb_array_elements(p_correcoes) loop
    v_ordem := v_ordem + 1;
    begin
      v_id := (v_item ->> 'id')::uuid;
    exception when others then
      raise exception 'Correção %: identificador da licença inválido.', v_ordem;
    end;

    select * into v_alvo from public.licencas where id = v_id for update;
    if not found or v_alvo.excluida_em is not null then
      raise exception 'Correção %: licença não encontrada ou na lixeira.', v_ordem;
    end if;

    v_numero := nullif(btrim(coalesce(v_item ->> 'numero', '')), '');
    v_sei    := nullif(btrim(coalesce(v_item ->> 'processo_sei', '')), '');
    if v_numero is null and v_sei is null then
      raise exception 'Correção %: informe o número ou o processo SEI.', v_ordem;
    end if;
    if v_numero is not null and v_numero !~ '^[0-9]{3}/[0-9]{4}$' then
      raise exception 'Correção %: o número precisa estar no padrão 000/AAAA.', v_ordem;
    end if;
    if v_sei is not null and v_sei !~ '^[0-9]+/[0-9]{4}$' then
      raise exception 'Correção %: o processo SEI precisa estar no padrão 000000000/AAAA.', v_ordem;
    end if;

    if coalesce(v_numero, v_alvo.numero) is distinct from v_alvo.numero
       or coalesce(v_sei, v_alvo.processo_sei) is distinct from v_alvo.processo_sei then
      update public.licencas
         set numero       = coalesce(v_numero, numero),
             processo_sei = coalesce(v_sei, processo_sei)
       where id = v_id;

      insert into public.licencas_correcoes (licenca_id, motivo, antes, depois)
      values (
        v_id, v_motivo,
        jsonb_build_object('numero', v_alvo.numero, 'processo_sei', v_alvo.processo_sei),
        jsonb_build_object('numero', coalesce(v_numero, v_alvo.numero), 'processo_sei', coalesce(v_sei, v_alvo.processo_sei))
      );
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.admin_corrigir_licencas(jsonb, text) from public, anon;
grant  execute on function public.admin_corrigir_licencas(jsonb, text) to authenticated;
