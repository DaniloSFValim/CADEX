-- =====================================================================
-- CADEX — retenção e exibição pública das comunicações ao CISP
--
-- Data do serviço: o intervalo inicio_previsto..fim_previsto. O público vê
-- o serviço nos dias em que ele acontece, para que a obra possa ser
-- identificada no dia. Não é um registro permanente no mapa.
--
-- Exibição pública (view comunicacoes_publicas), janela de 15 dias:
--   programado  da data de hoje até 15 dias à frente;
--   emergência  de 15 dias atrás até hoje.
-- A janela já limita o que a consulta devolve. O mapa mostra por padrão só
-- o que acontece hoje; a janela completa aparece quando a pessoa filtra.
--
-- Retenção: a comunicação é apagada 30 dias depois do último dia do
-- serviço (fim_previsto). Quem apaga é uma função agendada com pg_cron,
-- todos os dias, de madrugada (horário de Brasília). Exclusão definitiva:
-- não há lixeira nem cópia no CADEX.
--
-- Reversão: cancelar o agendamento (cron.unschedule), recriar a view sem a
-- janela e remover as funções. Apagamentos já feitos não se desfazem.
-- =====================================================================

-- Dia de hoje em Niterói (o servidor do banco usa UTC).
create or replace function public.hoje_niteroi()
returns date language sql stable
set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Janela pública: o que o mapa pode receber. Programado: de hoje a 15 dias
-- à frente. Emergência: de 15 dias atrás até hoje.
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
join public.empresas e on e.id = c.empresa_id
where (c.tipo = 'programado'
         and c.fim_previsto >= public.hoje_niteroi()
         and c.inicio_previsto <= public.hoje_niteroi() + 15)
   or (c.tipo = 'emergencia'
         and c.fim_previsto >= public.hoje_niteroi() - 15
         and c.inicio_previsto <= public.hoje_niteroi());

grant select on public.comunicacoes_publicas to anon, authenticated;

-- Retenção: apaga o que venceu há mais de 30 dias. Devolve quantas linhas
-- foram apagadas. Não é chamada pelo app: só pelo agendamento (ou pelo
-- administrador do banco).
create or replace function public.apagar_comunicacoes_vencidas()
returns integer language plpgsql security definer
set search_path = public as $$
declare
  apagadas integer;
begin
  delete from public.comunicacoes_servico
   where fim_previsto < public.hoje_niteroi() - 30;
  get diagnostics apagadas = row_count;
  return apagadas;
end $$;

revoke execute on function public.apagar_comunicacoes_vencidas() from public, anon, authenticated;

-- Agendamento diário, onde o pg_cron está disponível (Supabase). Em banco
-- sem pg_cron, o agendamento fica por conta de quem administra o banco.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema extensions;
    -- 03:15 em UTC = 00:15 em Brasília (sem horário de verão desde 2019).
    perform cron.schedule('cadex-apagar-comunicacoes', '15 3 * * *',
      'select public.apagar_comunicacoes_vencidas()');
  end if;
end $$;
