-- =====================================================================
-- CADEX — comunicação de emergência e local no mapa (acréscimo)
--
-- Duas modalidades na mesma tabela, com regras diferentes:
--   programado  serviço de manutenção de telecomunicações. Registro no
--               CADEX ANTES do início. Sem ligação ao 153.
--   emergencia  atendimento de emergência de concessionária de
--               telecomunicações. Ligação ao 153 ANTES de agir (fora do
--               CADEX). Registro no CADEX DEPOIS do fato, em até 72 horas.
--
-- O local é um ponto ou um trecho em linha reta, com os mesmos limites de
-- latitude e longitude de licenças e intervenções sem licença.
--
-- Comunicações são públicas: a view comunicacoes_publicas expõe só o que
-- a consulta precisa. Responsável e protocolo do 153 ficam internos.
--
-- Reversão: remover a view, as colunas novas e voltar a restrição de
-- tipo para somente 'programado' (só se não houver emergências).
-- =====================================================================

alter table public.comunicacoes_servico drop constraint if exists comunicacoes_servico_tipo_check;
alter table public.comunicacoes_servico
  add constraint comunicacoes_servico_tipo_check check (tipo in ('programado', 'emergencia')),
  add column tipo_servico text check (tipo_servico is null or btrim(tipo_servico) <> ''),
  add column ocorrido_em timestamptz,
  add column protocolo_cisp text check (protocolo_cisp is null or btrim(protocolo_cisp) <> ''),
  add column inicio_lat numeric(9,6) check (inicio_lat is null or inicio_lat between -23.10 and -22.75),
  add column inicio_lng numeric(9,6) check (inicio_lng is null or inicio_lng between -43.25 and -42.85),
  add column fim_lat numeric(9,6) check (fim_lat is null or fim_lat between -23.10 and -22.75),
  add column fim_lng numeric(9,6) check (fim_lng is null or fim_lng between -43.25 and -42.85),
  add constraint csp_fim_coerente check ((fim_lat is null) = (fim_lng is null)),
  add constraint csp_emergencia_tem_fato check (tipo <> 'emergencia' or ocorrido_em is not null);

create or replace function public.csp_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  placa text;
  ativa boolean;
  fuso constant text := 'America/Sao_Paulo';
begin
  new.responsavel := btrim(new.responsavel);
  new.local_servico := btrim(new.local_servico);
  new.descricao := btrim(new.descricao);
  new.tipo_servico := nullif(btrim(new.tipo_servico), '');
  new.protocolo_cisp := nullif(btrim(new.protocolo_cisp), '');

  select e.ativa into ativa from public.empresas e where e.id = new.empresa_id;
  if not coalesce(ativa, false) then
    raise exception 'Só empresas cadastradas e ativas no CADEX podem comunicar serviço.';
  end if;

  new.placas := array(
    select upper(regexp_replace(p, '[\s-]', '', 'g'))
    from unnest(new.placas) as p
  );
  foreach placa in array new.placas loop
    if placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
      raise exception 'Placa inválida: %. Use o padrão AAA0000 ou AAA0A00.', placa;
    end if;
  end loop;

  if tg_op = 'UPDATE' then
    -- O fato registrado não muda de modalidade nem de data.
    if new.tipo is distinct from old.tipo or new.ocorrido_em is distinct from old.ocorrido_em then
      raise exception 'Tipo e data do fato não podem ser alterados depois do registro.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.tipo_servico is null then
      raise exception 'Informe o tipo de serviço.';
    end if;
    if new.inicio_lat is null or new.inicio_lng is null then
      raise exception 'Marque o local no mapa (ponto ou trecho).';
    end if;

    if new.tipo = 'programado' then
      if new.comunicado_em::date > new.inicio_previsto then
        raise exception 'Serviço programado precisa ser registrado antes do início previsto.';
      end if;
    else
      -- Emergência: o registro é posterior ao fato, dentro de 72 horas.
      if new.ocorrido_em > now() then
        raise exception 'A data e hora da emergência não podem estar no futuro.';
      end if;
      if now() - new.ocorrido_em > interval '72 hours' then
        raise exception 'Emergência precisa ser registrada em até 72 horas do fato.';
      end if;
      new.comunicado_em := now();
      new.inicio_previsto := (new.ocorrido_em at time zone fuso)::date;
    end if;
  end if;

  if new.fim_previsto < new.inicio_previsto then
    raise exception 'A data de fim não pode ser anterior ao início.';
  end if;

  new.atualizado_em := now();
  return new;
end $$;

-- Consulta pública: sem responsável, sem protocolo do 153 e sem quem registrou.
create or replace view public.comunicacoes_publicas with (security_barrier = true) as
select
  c.id,
  c.tipo,
  e.razao_social,
  e.codigo_cadex,
  c.tipo_servico,
  c.descricao,
  c.local_servico,
  c.placas,
  c.inicio_lat, c.inicio_lng, c.fim_lat, c.fim_lng,
  c.ocorrido_em,
  c.inicio_previsto,
  c.fim_previsto,
  c.comunicado_em
from public.comunicacoes_servico c
join public.empresas e on e.id = c.empresa_id;

grant select on public.comunicacoes_publicas to anon, authenticated;
