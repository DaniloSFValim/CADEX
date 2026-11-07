-- =====================================================================
-- CADEX — portal da empresa: acesso de representantes de empresas
--
-- Quem entra: representantes cadastrados por um gestor da SECONSER, com
-- verificação em duas etapas obrigatória (aal2). Não é servidor.
-- O que vê e faz: a própria empresa (cadastro, somente leitura), as
-- licenças em que ela executa ou contrata (visão simplificada, somente
-- leitura) e as comunicações de serviço programado da própria empresa.
--
-- Isolamento: as regras consultam o vínculo a cada operação. Um usuário
-- de empresa não está em `servidores`, e um servidor não pode estar em
-- `empresa_usuarios` (gatilhos abaixo). Desativar o vínculo corta o acesso
-- na hora.
--
-- Reversão: remover as políticas, a view, as funções, os gatilhos e a
-- tabela `empresa_usuarios`. Não altera dados existentes.
-- =====================================================================

create table public.empresa_usuarios (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  empresa_id     uuid not null references public.empresas(id) on delete restrict,
  papel          text not null check (papel in ('representante', 'operador')),
  ativo          boolean not null default true,
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now(),
  desativado_em  timestamptz,
  constraint eu_desativado check (ativo or desativado_em is not null)
);

create index empresa_usuarios_empresa_idx on public.empresa_usuarios (empresa_id);

-- Um usuário é servidor ou de empresa, nunca os dois.
create or replace function public.eu_exclusivo()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_table_name = 'empresa_usuarios' then
    if exists (select 1 from public.servidores s where s.user_id = new.user_id) then
      raise exception 'Este usuário é servidor; não pode ter acesso de empresa.';
    end if;
  else
    if exists (select 1 from public.empresa_usuarios e where e.user_id = new.user_id) then
      raise exception 'Este usuário tem acesso de empresa; não pode ser servidor.';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.eu_exclusivo() from public, anon, authenticated;

create trigger empresa_usuarios_exclusivo
  before insert or update on public.empresa_usuarios
  for each row execute function public.eu_exclusivo();

create trigger servidores_exclusivo
  before insert on public.servidores
  for each row execute function public.eu_exclusivo();

create trigger zz_auditoria after insert or update on public.empresa_usuarios
  for each row execute function public.registrar_auditoria();

-- Empresa do usuário logado: só com vínculo ativo, de empresa ativa, e
-- com verificação em duas etapas. Sem isso, a função devolve nulo.
create or replace function public.empresa_do_usuario()
returns uuid language sql stable security definer
set search_path = public as $$
  select e.empresa_id
  from public.empresa_usuarios e
  join public.empresas x on x.id = e.empresa_id
  where e.user_id = auth.uid()
    and e.ativo
    and x.ativa
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.is_empresa_usuario()
returns boolean language sql stable security definer
set search_path = public as $$
  select public.empresa_do_usuario() is not null
$$;

revoke execute on function public.empresa_do_usuario() from public, anon;
revoke execute on function public.is_empresa_usuario() from public, anon;
grant  execute on function public.empresa_do_usuario() to authenticated;
grant  execute on function public.is_empresa_usuario() to authenticated;

-- Acesso à tabela: servidor lê todos; o próprio usuário lê o seu vínculo;
-- só gestor (com verificação em duas etapas) cria, altera ou desativa.
alter table public.empresa_usuarios enable row level security;
revoke all on public.empresa_usuarios from anon;
grant select, insert, update on public.empresa_usuarios to authenticated;

create policy eu_ler on public.empresa_usuarios for select to authenticated
  using (public.is_servidor() or user_id = auth.uid());
create policy eu_gravar on public.empresa_usuarios for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

-- Cadastro da empresa: o representante lê só a própria empresa. Não edita.
create policy empresas_empresa_ler on public.empresas for select to authenticated
  using (id = public.empresa_do_usuario());

-- Comunicações: a empresa lê e registra só as próprias. Não altera nem apaga.
create policy csp_empresa_ler on public.comunicacoes_servico for select to authenticated
  using (empresa_id = public.empresa_do_usuario());
create policy csp_empresa_inserir on public.comunicacoes_servico for insert to authenticated
  with check (empresa_id = public.empresa_do_usuario() and registrado_por = auth.uid());

-- Licenças da empresa, em visão simplificada e só leitura. A view roda com
-- o dono da tabela, então o filtro abaixo é o que isola cada empresa, e
-- não a política de `licencas`. Sem exclusões (lixeira), sem dados
-- contratuais nem de decisão.
create or replace view public.empresa_licencas with (security_barrier = true) as
select
  l.id,
  l.numero,
  l.escopo,
  l.setor,
  l.tipo_intervencao,
  l.situacao,
  l.inicio_previsto,
  l.fim_previsto,
  l.validade_ate,
  (l.executora_id = public.empresa_do_usuario())  as executa,
  (l.contratante_id = public.empresa_do_usuario()) as contrata
from public.licencas l
where l.excluida_em is null
  and public.empresa_do_usuario() is not null
  and (l.executora_id = public.empresa_do_usuario() or l.contratante_id = public.empresa_do_usuario());

revoke all on public.empresa_licencas from anon, authenticated;
grant select on public.empresa_licencas to authenticated;

-- A checagem de empresa ativa do gatilho de comunicação roda como dono da
-- função. Assim não depende do RLS de quem registra: o representante não vê
-- outras empresas, e a recusa precisa ser pela regra, não por "não existe".
alter function public.csp_antes_de_gravar() security definer set search_path = public;
