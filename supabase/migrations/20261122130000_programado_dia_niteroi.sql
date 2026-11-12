-- =====================================================================
-- CADEX — serviço programado registrado no dia do serviço, depois das 21h
--
-- A regra "registrar antes do início" comparava o dia do registro em UTC
-- (o fuso do banco) com a data do serviço, que é de Niterói. Depois das 21h
-- de Brasília, o registro do próprio dia caía no dia seguinte e era recusado.
-- Passa a comparar o dia de Niterói.
--
-- Reversão: recriar a função com a comparação antiga (comunicado_em::date).
-- =====================================================================

create or replace function public.csp_antes_de_gravar()
returns trigger language plpgsql
security definer
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
      -- Dia de Niterói, não o do servidor (UTC): depois das 21h, o dia em UTC já é o seguinte.
      if (new.comunicado_em at time zone fuso)::date > new.inicio_previsto then
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
