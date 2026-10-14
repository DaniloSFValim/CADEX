-- =====================================================================
-- CADEX — obras e serviços SEM licença (acréscimo; não altera licencas)
--
-- Tabela própria: o registro de obra licenciada, suas regras, o mapa
-- público e os dados abertos continuam exatamente como estão. Esta tabela
-- só guarda intervenções que não passam pelo processo de licença.
--
-- Quem executa (executora_modo):
--   propria_orgao  o próprio órgão contratante executa (ex.: SECONSER com
--                  equipe própria). Sem empresa; executora_id é nulo.
--   empresa        empresa cadastrada no CADEX (executora_id).
--   sem_cadastro   empresa fora do cadastro (razão social e CNPJ digitados).
--
-- Contratante: sempre um órgão cadastrado em orgaos_publicos (inclusive a
-- própria SECONSER, quando ela executa). Não aparece na consulta pública:
-- é para fiscalização interna.
--
-- Regularização: quando a licença sair, licenca_id aponta para ela. O
-- registro não é recadastrado.
--
-- Reversão: remover a tabela (nenhuma outra tabela depende dela).
-- =====================================================================

create table public.intervencoes_sem_licenca (
  id                       uuid primary key default extensions.gen_random_uuid(),
  setor                    text not null
                             check (setor in ('telecom', 'gas', 'saneamento', 'drenagem', 'construcao', 'viario')),
  tipo_intervencao         text not null check (tipo_intervencao in ('obra', 'servico')),
  escopo                   text not null check (btrim(escopo) <> ''),
  contratante_orgao_id     uuid not null references public.orgaos_publicos(id) on delete restrict,
  executora_modo           text not null check (executora_modo in ('propria_orgao', 'empresa', 'sem_cadastro')),
  executora_id             uuid references public.empresas(id) on delete restrict,
  executora_razao_social   text,
  executora_cnpj           text check (executora_cnpj is null or executora_cnpj ~ '^\d{14}$'),
  -- Local: um ponto ou um trecho em linha reta, como nas licenças.
  logradouro               text not null check (btrim(logradouro) <> ''),
  bairro                   text,
  referencia               text,
  inicio_lat               numeric(9,6) not null check (inicio_lat between -23.10 and -22.75),
  inicio_lng               numeric(9,6) not null check (inicio_lng between -43.25 and -42.85),
  fim_lat                  numeric(9,6) check (fim_lat is null or fim_lat between -23.10 and -22.75),
  fim_lng                  numeric(9,6) check (fim_lng is null or fim_lng between -43.25 and -42.85),
  -- Período previsto (opcional: o registro pode ser feito antes do cronograma).
  inicio_previsto          date,
  fim_previsto             date,
  situacao                 text not null default 'em_execucao'
                             check (situacao in ('em_execucao', 'concluida', 'cancelada')),
  concluida_em             date,
  -- Documentos (opcionais).
  processo_sei             text,
  contrato_numero          text,
  processo_administrativo  text,
  ordem_servico_numero     text,
  observacoes              text,
  -- Regularização: a licença que passou a cobrir esta intervenção.
  licenca_id               uuid references public.licencas(id) on delete set null,
  criado_por               uuid default auth.uid(),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),

  constraint isl_executora_coerente check (
    (executora_modo = 'propria_orgao' and executora_id is null and executora_razao_social is null)
    or (executora_modo = 'empresa' and executora_id is not null and executora_razao_social is null)
    or (executora_modo = 'sem_cadastro' and executora_id is null and executora_razao_social is not null
        and btrim(executora_razao_social) <> '')
  ),
  constraint isl_fim_coerente check ((fim_lat is null) = (fim_lng is null)),
  constraint isl_periodo check (inicio_previsto is null or fim_previsto is null or fim_previsto >= inicio_previsto),
  constraint isl_concluida check ((situacao = 'concluida') = (concluida_em is not null))
);

-- Processo SEI único quando informado (vários registros podem ficar sem processo).
create unique index intervencoes_sem_licenca_processo_uk on public.intervencoes_sem_licenca (processo_sei)
  where processo_sei is not null;
create index intervencoes_sem_licenca_orgao_idx on public.intervencoes_sem_licenca (contratante_orgao_id);

create or replace function public.isl_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.escopo := btrim(new.escopo);
  new.logradouro := btrim(new.logradouro);
  new.bairro := nullif(btrim(new.bairro), '');
  new.referencia := nullif(btrim(new.referencia), '');
  new.executora_razao_social := nullif(btrim(new.executora_razao_social), '');
  new.processo_sei := nullif(upper(btrim(new.processo_sei)), '');
  new.contrato_numero := nullif(btrim(new.contrato_numero), '');
  new.processo_administrativo := nullif(btrim(new.processo_administrativo), '');
  new.ordem_servico_numero := nullif(btrim(new.ordem_servico_numero), '');
  new.observacoes := nullif(btrim(new.observacoes), '');
  new.atualizado_em := now();
  if new.executora_modo = 'empresa' and not public.empresa_atua_no_setor(new.executora_id, new.setor) then
    raise exception 'A empresa executora não atua no setor desta intervenção.';
  end if;
  return new;
end $$;

revoke execute on function public.isl_antes_de_gravar() from public, anon, authenticated;

create trigger intervencoes_sem_licenca_antes_de_gravar
  before insert or update on public.intervencoes_sem_licenca
  for each row execute function public.isl_antes_de_gravar();

create trigger zz_auditoria after insert or update on public.intervencoes_sem_licenca
  for each row execute function public.registrar_auditoria();

-- Acesso: servidor lê; só gestor e licenciador gravam (igual às licenças).
-- Nada para anônimo: não aparece na consulta pública. Exclusão fica para
-- uma etapa seguinte (a lixeira daqui precisa de tela própria).
alter table public.intervencoes_sem_licenca enable row level security;
revoke all on public.intervencoes_sem_licenca from anon;
grant select, insert, update on public.intervencoes_sem_licenca to authenticated;
create policy isl_ler on public.intervencoes_sem_licenca for select to authenticated
  using (public.is_servidor());
create policy isl_gravar on public.intervencoes_sem_licenca for all to authenticated
  using (public.is_gestor() or public.is_licenciador())
  with check (public.is_gestor() or public.is_licenciador());
