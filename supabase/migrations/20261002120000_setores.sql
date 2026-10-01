-- =====================================================================
-- CADEX — outros setores: gás, saneamento, drenagem e construção civil
--
-- A Resolução Conjunta nº 001/2026 vale só para telecomunicações. Os
-- demais setores entram no mesmo cadastro, com exigências mais leves.
--
-- Tipo da empresa (papel) e setores em que atua:
--
--   operadora      contratante de telecom            setores = {telecom}
--   concessionaria contratante de gás (Naturgy) ou   setores = {gas} ou {saneamento}
--                  de saneamento (Águas de Niterói)
--   construtora    pessoa jurídica que constrói      setores = {construcao}
--                  imóveis (com licença de obra da
--                  Prefeitura); contrata terceirizadas
--                  e também executa (ex.: drenagem)
--   terceirizada   executa para qualquer contratante setores = um ou mais
--
-- Drenagem não tem concessionária: são ligações de imóveis particulares
-- à rede pública, feitas por terceirizada ou pela própria construtora.
--
-- Código CADEX por tipo: OPE, GAS, SAN, CON, TER. Os já emitidos não mudam.
--
-- Documentos por perfil (tipos_documento.perfis):
--   art. 6º, I, a-f e II, a-b (identificação, certidões fiscais e RT): todos
--   III (regularidade no órgão regulador: Anatel ou AGENERSA) e
--   IV (mapa da infraestrutura): telecom, gás e saneamento
--   V (compartilhamento e adimplência): só telecom
--   I, g (CRF/FGTS), I, h (CNDT) e II, c (equipamentos e pessoal): deixam
--       de ser exigidos (decisão da SECONSER de 01/10/2026). Os tipos ficam
--       no catálogo, sem perfil, para não perder histórico.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Empresas: tipo e setores
-- ---------------------------------------------------------------------
alter table public.empresas drop constraint empresas_tipo_check;
alter table public.empresas add constraint empresas_tipo_check
  check (tipo in ('operadora', 'concessionaria', 'construtora', 'terceirizada'));

alter table public.empresas
  add column setores text[] not null default '{}'
    check (setores <@ array['telecom', 'gas', 'saneamento', 'drenagem', 'construcao']);

update public.empresas set setores = '{telecom}';

create or replace function public.proximo_codigo_cadex(p_tipo text, p_setores text[])
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_prefixo text := case p_tipo
    when 'operadora'    then 'OPE'
    when 'terceirizada' then 'TER'
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

revoke execute on function public.empresas_antes_de_gravar() from public, anon, authenticated;
drop function public.proximo_codigo_cadex(text);

-- Veículo: a traseira traz o nome de quem contratou (art. 21), que pode
-- ser operadora, concessionária ou construtora.
create or replace function public.veiculos_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.placa := nullif(upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g')), '');
  -- Placa antiga (ABC1234) ou Mercosul (ABC1D23).
  if new.placa is not null and new.placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Placa inválida: %', new.placa;
  end if;
  if new.concessionaria_traseira_id is not null and not exists (
       select 1 from public.empresas where id = new.concessionaria_traseira_id and tipo <> 'terceirizada') then
    raise exception 'A contratante indicada na traseira precisa ser operadora, concessionária ou construtora.';
  end if;
  return new;
end;
$$;

revoke execute on function public.veiculos_antes_de_gravar() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Documentos exigidos por perfil
-- ---------------------------------------------------------------------
alter table public.tipos_documento
  add column perfis text[] not null
    default array['telecom', 'gas', 'saneamento', 'construtora', 'terceirizada']
    check (perfis <@ array['telecom', 'gas', 'saneamento', 'construtora', 'terceirizada']);

update public.tipos_documento set perfis = '{telecom,gas,saneamento}'
 where codigo in ('DECL_REGULADOR', 'MAPA_INFRA');
update public.tipos_documento set perfis = '{telecom}'
 where codigo in ('CONTRATO_COMPART', 'COMPROV_ADIMPLENCIA');
update public.tipos_documento set perfis = '{}'
 where codigo in ('CRF_FGTS', 'CNDT', 'REL_EQUIPAMENTOS');
update public.tipos_documento
   set fundamento = 'Conformidade regulatória: Anatel (telecom) ou AGENERSA (gás e saneamento)'
 where codigo = 'DECL_REGULADOR';

-- Perfil documental da empresa.
create or replace function public.perfil_documental(p_tipo text, p_setores text[])
returns text language sql immutable
set search_path = public as $$
  select case p_tipo
    when 'operadora'      then 'telecom'
    when 'concessionaria' then p_setores[1]
    else p_tipo end;
$$;

-- ---------------------------------------------------------------------
-- Consulta pública: tipo e setores
-- ---------------------------------------------------------------------
drop function public.consulta_publica();

create function public.consulta_publica()
returns table (
  codigo_cadex    text,
  razao_social    text,
  nome_fantasia   text,
  cnpj            text,
  tipo            text,
  setores         text[],
  situacao        text,
  validade_ate    date,
  portaria_numero text,
  portaria_data   date,
  contratantes    text[],
  logo_arquivo    text
)
language sql stable security definer
set search_path = public as $$
  select e.codigo_cadex, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo, e.setores,
         public.situacao_efetiva(e.situacao, e.validade_ate),
         e.validade_ate, e.portaria_numero, e.portaria_data,
         coalesce((select array_agg(coalesce(nullif(btrim(c.nome_fantasia), ''), c.razao_social)
                                    order by c.razao_social)
                     from public.vinculos v join public.empresas c on c.id = v.contratante_id
                    where v.contratada_id = e.id and v.fim is null), '{}'),
         e.logo_arquivo
    from public.empresas e
   order by e.razao_social;
$$;

revoke execute on function public.consulta_publica() from public;
grant  execute on function public.consulta_publica() to anon, authenticated;
