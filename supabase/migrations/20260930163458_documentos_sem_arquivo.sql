-- =====================================================================
-- CADEX — registro de documentos sem arquivo
--
-- O site deixou de enviar arquivos (28/09): a SECONSER marca cada
-- documento como entregue ou pendente e, para os que vencem, informa a
-- validade. A tabela ainda exigia o arquivo, então nenhum registro podia
-- ser criado e as marcações se perdiam.
--
-- Cada marcação é um registro novo; vale o mais recente de cada tipo, e
-- os anteriores ficam como histórico (ex.: renovações de certidão).
-- Entregue de documento que vence continua exigindo a validade.
-- =====================================================================

alter table public.documentos alter column arquivo drop not null;
alter table public.documentos alter column nome_arquivo drop not null;

update public.documentos set status = 'entregue' where status is null;
alter table public.documentos alter column status set default 'entregue';
alter table public.documentos alter column status set not null;

create or replace function public.documentos_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.status = 'entregue'
     and (select tem_validade from public.tipos_documento where codigo = new.tipo)
     and new.validade is null then
    raise exception 'Informe a data de validade deste documento.';
  end if;
  if new.arquivo is not null and split_part(new.arquivo, '/', 1) <> new.empresa_id::text then
    raise exception 'O arquivo precisa estar na pasta da própria empresa.';
  end if;
  return new;
end;
$$;

revoke execute on function public.documentos_antes_de_gravar() from public, anon, authenticated;
