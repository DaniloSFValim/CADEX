-- =====================================================================
-- Correção em lote de licenças (só administrador).
-- Corrige erros de digitação em número e processo SEI, caso a caso:
-- cada item traz o id da licença e os campos novos. O lote é atômico:
-- se um item for inválido, nada é gravado. A auditoria (zz_auditoria)
-- registra antes/depois e quem alterou, linha a linha.
-- =====================================================================

create or replace function public.admin_corrigir_licencas(p_correcoes jsonb)
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
begin
  if not public.is_administrador() then
    raise exception 'Só o administrador corrige licenças em lote.';
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

    update public.licencas
       set numero       = coalesce(v_numero, numero),
           processo_sei = coalesce(v_sei, processo_sei)
     where id = v_id
       and (numero is distinct from coalesce(v_numero, numero)
            or processo_sei is distinct from coalesce(v_sei, processo_sei));
    if found then
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.admin_corrigir_licencas(jsonb) from public, anon;
grant  execute on function public.admin_corrigir_licencas(jsonb) to authenticated;
