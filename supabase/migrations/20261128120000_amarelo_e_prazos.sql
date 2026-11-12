-- =====================================================================
-- CADEX — prazos de comunicação ao CISP e obras sem licença no mapa público.
--
-- Serviço programado: registrado com 24 horas de antecedência; no mapa, de 15
-- dias à frente e até 7 dias depois do fim do serviço.
-- Emergência: registrada em até 72 horas do fato (igual à regra anterior); no mapa,
-- 15 dias para trás.
-- Obra sem licença em execução: no mapa público (amarela), com a mesma janela
-- dos programados. Concluída ou cancelada sai do mapa.
--
-- Reversão: recriar a função com 72 horas e sem a comparação de antecedência,
-- e as views sem a janela nova (versões de 20261124120000 e 20261122130000).
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
      -- 24 horas de antecedência, contadas do início do dia do serviço em Niterói.
      if new.comunicado_em > ((new.inicio_previsto::timestamp at time zone fuso) - interval '24 hours') then
        raise exception 'Serviço programado precisa ser registrado com 24 horas de antecedência.';
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


-- Consulta pública das comunicações: programado com 7 dias depois do fim.
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
join public.empresas e on e.id = c.empresa_id and not e.teste
     and public.situacao_efetiva(e.situacao, e.validade_ate) in ('deferida', 'apta')
where (c.tipo = 'programado'
         and c.fim_previsto >= public.hoje_niteroi() - 7
         and c.inicio_previsto <= public.hoje_niteroi() + 15)
   or (c.tipo = 'emergencia'
         and c.fim_previsto >= public.hoje_niteroi() - 15
         and c.inicio_previsto <= public.hoje_niteroi());

grant select on public.comunicacoes_publicas to anon, authenticated;

-- Obras sem licença em execução, para o mapa público. Sem dados internos
-- (processo, contrato, observações, quem registrou).
create or replace view public.intervencoes_publicas with (security_barrier = true) as
select
  i.id,
  i.setor,
  i.tipo_intervencao,
  i.escopo,
  i.tipos_obra,
  i.logradouro,
  i.bairro,
  i.referencia,
  coalesce(nullif(btrim(e.nome_fantasia), ''), e.razao_social, nullif(btrim(i.executora_razao_social), '')) as executora,
  i.inicio_lat, i.inicio_lng, i.fim_lat, i.fim_lng,
  i.inicio_previsto,
  i.fim_previsto
from public.intervencoes_sem_licenca i
left join public.empresas e on e.id = i.executora_id
where i.situacao = 'em_execucao'
  and (e.id is null or not e.teste)
  and coalesce(i.fim_previsto, i.inicio_previsto) >= public.hoje_niteroi() - 7
  and i.inicio_previsto <= public.hoje_niteroi() + 15;

grant select on public.intervencoes_publicas to anon, authenticated;
