-- =====================================================================
-- CADEX — a publicação da portaria torna a empresa APTA
--
-- Quem lança a publicação no sistema é a SECONSER. Gravada a portaria
-- (número e data), a empresa em análise ou deferida passa a APTA, e a
-- validade de 12 meses a partir da publicação (art. 7º, § 1º) é calculada
-- pelo gatilho empresas_situacao, que roda logo depois deste.
--
-- A conferência dos documentos obrigatórios continua valendo: se algum
-- estiver pendente, a gravação é recusada pelo mesmo gatilho.
--
-- Este gatilho tem nome que ordena antes de empresas_situacao (o Postgres
-- executa gatilhos BEFORE pela ordem do nome).
--
-- Reversão: remover o gatilho empresas_publicacao_apta e a função.
-- =====================================================================

create or replace function public.empresas_publicacao_apta()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.portaria_numero is not null and new.portaria_data is not null
     and new.situacao in ('em_analise', 'deferida')
     and (tg_op = 'INSERT'
          or new.portaria_numero is distinct from old.portaria_numero
          or new.portaria_data is distinct from old.portaria_data
          or new.situacao is distinct from old.situacao) then
    new.situacao := 'apta';
  end if;
  return new;
end $$;

revoke execute on function public.empresas_publicacao_apta() from public, anon, authenticated;

create trigger empresas_publicacao_apta
  before insert or update on public.empresas
  for each row execute function public.empresas_publicacao_apta();
