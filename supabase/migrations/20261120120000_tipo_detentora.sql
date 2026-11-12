-- =====================================================================
-- CADEX — tipo "detentora" (infraestrutura compartilhada, sem outorga)
--
-- A detentora não tem outorga da Anatel: a regularidade é comprovada pela
-- Carta de Compartilhamento (ou Carta de Anuência), que substitui a
-- declaração de regularidade da Anatel (DECL_REGULADOR) para ela.
-- Atua só em telecomunicações (setor telecom) e pode executar obras e
-- serviços por conta própria, como a operadora.
--
-- Contratante de licença e de vínculo continua sendo só a operadora (regras
-- existentes); a detentora atua como executora.
--
-- Código CADEX: CADEX-DET-ano-nnnn.
--
-- Reversão: voltar as restrições de tipo e de perfil, remover o documento
-- CARTA_COMPART e restaurar as funções. Só se não houver detentoras.
-- =====================================================================

alter table public.empresas drop constraint if exists empresas_tipo_check;
alter table public.empresas add constraint empresas_tipo_check
  check (tipo in ('operadora', 'detentora', 'concessionaria', 'construtora', 'terceirizada'));

alter table public.tipos_documento drop constraint if exists tipos_documento_perfis_check;
alter table public.tipos_documento add constraint tipos_documento_perfis_check
  check (perfis <@ array['telecom', 'gas', 'saneamento', 'construtora', 'terceirizada', 'detentora']);

create or replace function public.proximo_codigo_cadex(p_tipo text, p_setores text[])
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_prefixo text := case p_tipo
    when 'operadora'    then 'OPE'
    when 'terceirizada' then 'TER'
    when 'detentora'    then 'DET'
    when 'construtora'  then 'CON'
    when 'concessionaria' then case p_setores[1] when 'gas' then 'GAS' when 'saneamento' then 'SAN' end
  end;
  v_ano int := extract(year from current_date)::int;
  v_n   int;
begin
  if v_prefixo is null then raise exception 'Tipo de empresa desconhecido: %', p_tipo; end if;
  -- O upsert trava a linha da sequência: dois cadastros simultâneos não
  -- recebem o mesmo número.
  insert into public.sequencias_cadex (prefixo, ano, ultimo) values (v_prefixo, v_ano, 1)
  on conflict (prefixo, ano) do update set ultimo = sequencias_cadex.ultimo + 1
  returning ultimo into v_n;
  return format('CADEX-%s-%s-%s', v_prefixo, v_ano, lpad(v_n::text, 4, '0'));
end;
$$;

revoke execute on function public.proximo_codigo_cadex(text, text[]) from public, anon, authenticated;

create or replace function public.empresas_antes_de_gravar()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  new.cnpj := regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g');
  new.atualizado_em := now();

  -- Setores conforme o tipo.
  case new.tipo
    when 'operadora'   then new.setores := '{telecom}';
    when 'detentora'   then new.setores := '{telecom}';
    when 'construtora' then new.setores := '{construcao}';
    when 'concessionaria' then
      if cardinality(new.setores) <> 1 or not (new.setores <@ array['gas', 'saneamento']) then
        raise exception 'Concessionária: informe o setor (gás ou saneamento).';
      end if;
    when 'terceirizada' then
      select coalesce(array_agg(distinct s order by s), '{}') into new.setores from unnest(new.setores) s;
      if cardinality(new.setores) = 0 then
        raise exception 'Terceirizada: marque ao menos um setor em que atua.';
      end if;
  end case;

  if tg_op = 'INSERT' then
    new.codigo_cadex := public.proximo_codigo_cadex(new.tipo, new.setores);
  else
    if new.codigo_cadex is distinct from old.codigo_cadex then
      raise exception 'O código CADEX é permanente e não pode ser alterado.';
    end if;
    if new.tipo is distinct from old.tipo then
      raise exception 'O tipo da empresa faz parte do código CADEX e não pode ser alterado.';
    end if;
    if new.tipo = 'concessionaria' and new.setores is distinct from old.setores then
      raise exception 'O setor da concessionária faz parte do código CADEX e não pode ser alterado.';
    end if;
    if new.cnpj is distinct from old.cnpj then
      raise exception 'O CNPJ é a identidade da empresa e não pode ser alterado.';
    end if;
  end if;

  return new;
end;
$$;

-- Documentos de telecom valem também para a detentora, exceto a declaração
-- da Anatel (substituída pela carta) e o contrato de compartilhamento (idem).
update public.tipos_documento
   set perfis = array_append(perfis, 'detentora')
 where 'telecom' = any(perfis) and codigo not in ('DECL_REGULADOR', 'CONTRATO_COMPART');

insert into public.tipos_documento (codigo, nome, fundamento, obrigatorio, tem_validade, ordem, perfis) values
  ('CARTA_COMPART', 'Carta de Compartilhamento ou Carta de Anuência',
   'Compartilhamento de infraestrutura (detentora, em lugar da outorga da Anatel)', true, true, 145, array['detentora']);
