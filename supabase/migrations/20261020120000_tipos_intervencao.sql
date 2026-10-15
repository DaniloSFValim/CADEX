-- =====================================================================
-- Catálogo de tipos de obra e serviço por setor, mantido pela administração.
--
-- Antes, os nove tipos eram um CHECK fixo em licencas.tipos_obra, igual para
-- todos os setores. Agora cada setor tem o seu catálogo:
--   - o código é imutável (uma licença já usa o código; só o rótulo muda);
--   - tipo desativado sai das opções novas, mas as licenças que já o usam
--     continuam válidas;
--   - "outros" é fixo nos setores que o aceitam e não pode ser desativado;
--     exige descrição no registro;
--   - cada tipo guarda a fonte (ato ou processo) que o criou.
-- Telecom não recebe "outros": o art. 10 é o enquadramento daquele setor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo
-- ---------------------------------------------------------------------
create table public.tipos_intervencao (
  id              uuid not null default gen_random_uuid() unique,
  setor           text not null check (setor in ('telecom', 'gas', 'saneamento', 'drenagem', 'construcao', 'viario')),
  codigo          text not null check (codigo ~ '^[a-z][a-z_]{1,39}$'),
  rotulo          text not null check (length(btrim(rotulo)) between 2 and 120),
  fonte           text not null check (length(btrim(fonte)) between 3 and 500),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  primary key (setor, codigo),
  constraint tipos_outros_sempre_ativo check (codigo <> 'outros' or ativo)
);

-- Código e setor não mudam. "Outros" não sai do catálogo.
create or replace function public.tipos_intervencao_protege()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.setor <> old.setor or new.codigo <> old.codigo then
      raise exception 'Código e setor de um tipo não mudam: crie outro tipo e desative este.'
        using errcode = 'check_violation';
    end if;
    if old.setor = 'telecom' and not new.ativo then
      raise exception 'Os tipos de telecomunicações são o art. 10 da Resolução e não são desativados pela tela.'
        using errcode = 'check_violation';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger tipos_intervencao_protege before update on public.tipos_intervencao
  for each row execute function public.tipos_intervencao_protege();

create trigger zz_auditoria after insert or update on public.tipos_intervencao
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- 2. Validação compartilhada por licenças e obras sem licença
-- ---------------------------------------------------------------------
-- Cada tipo novo precisa existir, ser do setor e estar ativo. Tipo que já
-- estava no registro pode continuar mesmo depois de desativado.
-- Sem tipo, o registro é recusado. "Outros" exige descrição.
create or replace function public.tipos_intervencao_validar(
  p_setor text, p_antigos text[], p_novos text[], p_outros_descricao text
) returns void language plpgsql stable security definer set search_path = public as $$
declare
  t text;
begin
  if p_novos is null or cardinality(p_novos) = 0 then
    raise exception 'Marque ao menos um tipo de obra ou serviço.' using errcode = 'check_violation';
  end if;

  foreach t in array p_novos loop
    if not exists (
      select 1 from public.tipos_intervencao c
      where c.setor = p_setor and c.codigo = t
        and (c.ativo or t = any (coalesce(p_antigos, '{}')))
    ) then
      raise exception 'O tipo % não está disponível para o setor %.', t, p_setor
        using errcode = 'check_violation';
    end if;
  end loop;

  if 'outros' = any (p_novos) and nullif(btrim(coalesce(p_outros_descricao, '')), '') is null then
    raise exception 'Descreva o tipo "Outros" no campo de descrição.' using errcode = 'check_violation';
  end if;
end $$;

-- Chamada pelos gatilhos de licenças e obras sem licença, que rodam como o
-- usuário autenticado. Anônimo não executa.
revoke execute on function public.tipos_intervencao_validar(text, text[], text[], text) from public, anon;
grant execute on function public.tipos_intervencao_validar(text, text[], text[], text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Licenças: troca o CHECK fixo pelo catálogo
-- ---------------------------------------------------------------------
alter table public.licencas drop constraint licencas_tipos_obra_check;
alter table public.licencas
  add constraint licencas_tipos_obra_check check (cardinality(tipos_obra) > 0),
  add column outros_descricao text;

create or replace function public.licencas_valida_tipos()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.tipos_intervencao_validar(
    new.setor::text,
    case when tg_op = 'UPDATE' then old.tipos_obra else '{}' end,
    new.tipos_obra,
    new.outros_descricao);
  return new;
end $$;

create trigger licencas_tipos_validos
  before insert or update of tipos_obra, setor, outros_descricao on public.licencas
  for each row execute function public.licencas_valida_tipos();

-- ---------------------------------------------------------------------
-- 4. Obras e serviços sem licença: mesma escolha de tipos
-- ---------------------------------------------------------------------
alter table public.intervencoes_sem_licenca
  add column tipos_obra text[] not null default '{}' check (cardinality(tipos_obra) > 0),
  add column outros_descricao text;
alter table public.intervencoes_sem_licenca alter column tipos_obra drop default;

create or replace function public.intervencoes_sem_licenca_valida_tipos()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.tipos_intervencao_validar(
    new.setor::text,
    case when tg_op = 'UPDATE' then old.tipos_obra else '{}' end,
    new.tipos_obra,
    new.outros_descricao);
  return new;
end $$;

create trigger intervencoes_sem_licenca_tipos_validos
  before insert or update of tipos_obra, setor, outros_descricao on public.intervencoes_sem_licenca
  for each row execute function public.intervencoes_sem_licenca_valida_tipos();

-- ---------------------------------------------------------------------
-- 5. Acesso: leitura pública dos tipos ativos (a placa e o mapa mostram
--    o rótulo); servidor lê todos; só administrador grava.
-- ---------------------------------------------------------------------
alter table public.tipos_intervencao enable row level security;
revoke all on public.tipos_intervencao from anon, authenticated;
grant select on public.tipos_intervencao to anon, authenticated;
grant insert, update on public.tipos_intervencao to authenticated;

create policy tipos_ler on public.tipos_intervencao for select to anon, authenticated
  using (ativo or public.is_servidor());
-- Telecom fica no art. 10: a tela não inclui tipo nesse setor.
create policy tipos_incluir on public.tipos_intervencao for insert to authenticated
  with check (public.is_administrador() and setor <> 'telecom');
create policy tipos_alterar on public.tipos_intervencao for update to authenticated
  using (public.is_administrador()) with check (public.is_administrador());

-- ---------------------------------------------------------------------
-- 6. Carga inicial
-- ---------------------------------------------------------------------
-- Os nove códigos do art. 10 vêm do cadastro atual, com os rótulos de antes.
-- Telecom: o art. 10 da Resolução. Demais setores: mesma lista que o
-- sistema já oferecia; a aplicação a cada setor ainda precisa ser confirmada.
insert into public.tipos_intervencao (setor, codigo, rotulo, fonte)
select s.setor, a.codigo, a.rotulo, s.fonte
from (values ('telecom', 'Art. 10 da Resolução (setor de telecomunicações).'),
             ('gas', 'Lista inicial do sistema; aplicação a este setor a confirmar.'),
             ('saneamento', 'Lista inicial do sistema; aplicação a este setor a confirmar.'),
             ('drenagem', 'Lista inicial do sistema; aplicação a este setor a confirmar.'),
             ('construcao', 'Lista inicial do sistema; aplicação a este setor a confirmar.'),
             ('viario', 'Lista inicial do sistema; aplicação a este setor a confirmar.')) s(setor, fonte)
cross join (values
  ('vala', 'Abertura de vala'),
  ('escavacao', 'Escavação a céu aberto'),
  ('perfuracao_nao_destrutiva', 'Perfuração não destrutiva'),
  ('poste', 'Implantação de poste'),
  ('rede', 'Instalação ou expansão de rede'),
  ('ligacao_predial', 'Ligação de imóvel à rede pública'),
  ('galeria_drenagem', 'Galeria ou rede de drenagem'),
  ('boca_de_lobo', 'Boca de lobo ou caixa de ralo'),
  ('recomposicao', 'Recomposição de calçada ou pavimento')
) a(codigo, rotulo);

-- Bicicletário: indicado pela SEMOBI/SERTTEL; o ato de referência ainda não está registrado.
insert into public.tipos_intervencao (setor, codigo, rotulo, fonte) values
  ('viario', 'bicicletario', 'Bicicletário', 'Indicado pela SEMOBI/SERTTEL; ato de referência a registrar.');

-- "Outros" nos setores que não são telecom.
insert into public.tipos_intervencao (setor, codigo, rotulo, fonte)
select s, 'outros', 'Outros (descrever)', 'Opção para serviço fora da lista; a descrição é obrigatória no registro.'
from unnest(array['gas', 'saneamento', 'drenagem', 'construcao', 'viario']) s;
