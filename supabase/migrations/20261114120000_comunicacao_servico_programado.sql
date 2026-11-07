-- =====================================================================
-- CADEX — comunicação prévia de serviço programado ao CISP
--
-- Regra: serviços programados devem ser comunicados ao CISP (153) antes
-- do início. Só empresas cadastradas no CADEX podem comunicar. A
-- comunicação precisa informar o número de cadastro, o responsável e as
-- placas dos veículos usados. Serviços de emergência ficam para uma etapa
-- seguinte: o campo "tipo" já aceita só 'programado'.
--
-- Quem registra: um servidor (gestor ou licenciador). Registro pela própria
-- empresa depende de acesso de empresa ao sistema, que ainda não existe.
--
-- Reversão: remover a tabela e a função de validação (nenhuma outra tabela
-- depende delas). Não altera empresas, licenças nem a consulta pública.
-- =====================================================================

create table public.comunicacoes_servico (
  id                       uuid primary key default extensions.gen_random_uuid(),
  empresa_id               uuid not null references public.empresas(id) on delete restrict,
  tipo                     text not null default 'programado' check (tipo = 'programado'),
  responsavel              text not null check (btrim(responsavel) <> ''),
  placas                   text[] not null check (cardinality(placas) >= 1),
  local_servico            text not null check (btrim(local_servico) <> ''),
  descricao                text not null check (btrim(descricao) <> ''),
  inicio_previsto          date not null,
  fim_previsto             date not null,
  -- Momento em que a comunicação foi feita. Para programado, precisa ser
  -- anterior ou igual ao início (checado na gravação).
  comunicado_em            timestamptz not null default now(),
  registrado_por           uuid default auth.uid(),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  constraint csp_periodo check (fim_previsto >= inicio_previsto)
);

create index comunicacoes_servico_empresa_idx on public.comunicacoes_servico (empresa_id, inicio_previsto);

-- Normaliza e valida: placa no padrão antigo (AAA0000) ou Mercosul (AAA0A00),
-- sem hífen nem espaço; empresa precisa estar ativa; comunicação antes do início.
create or replace function public.csp_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  placa text;
  ativa boolean;
begin
  new.responsavel := btrim(new.responsavel);
  new.local_servico := btrim(new.local_servico);
  new.descricao := btrim(new.descricao);
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
  if tg_op = 'INSERT' and new.comunicado_em::date > new.inicio_previsto then
    raise exception 'Serviço programado precisa ser comunicado antes do início previsto.';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

revoke execute on function public.csp_antes_de_gravar() from public, anon, authenticated;

create trigger comunicacoes_servico_antes_de_gravar
  before insert or update on public.comunicacoes_servico
  for each row execute function public.csp_antes_de_gravar();

create trigger zz_auditoria after insert or update on public.comunicacoes_servico
  for each row execute function public.registrar_auditoria();

-- Acesso: servidor lê (inclusive o CISP); gestor e licenciador gravam. Sem
-- exclusão: a comunicação é histórico. Nada para anônimo.
alter table public.comunicacoes_servico enable row level security;
revoke all on public.comunicacoes_servico from anon;
grant select, insert, update on public.comunicacoes_servico to authenticated;
create policy csp_ler on public.comunicacoes_servico for select to authenticated
  using (public.is_servidor());
create policy csp_gravar on public.comunicacoes_servico for all to authenticated
  using (public.is_gestor() or public.is_licenciador())
  with check (public.is_gestor() or public.is_licenciador());
