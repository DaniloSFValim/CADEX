-- =====================================================================
-- Órgãos públicos: inclusão, alteração e exclusão ficam na auditoria.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

do $$
declare org uuid;
begin
  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Órgão AUD', 'OAUD', 'municipal', 'administracao_direta', '{}') returning id into org;
  update orgaos_publicos set sigla = 'OAUD2' where id = org;
  delete from orgaos_publicos where id = org;

  perform pg_temp.assert((select count(*) from auditoria where tabela = 'orgaos_publicos' and registro_id = org and operacao = 'INSERT') = 1,
    'inclusão de órgão não ficou na auditoria');
  perform pg_temp.assert((select count(*) from auditoria where tabela = 'orgaos_publicos' and registro_id = org and operacao = 'UPDATE'
                            and antes ->> 'sigla' = 'OAUD' and depois ->> 'sigla' = 'OAUD2') = 1,
    'alteração de órgão não ficou na auditoria com antes e depois');
  perform pg_temp.assert((select count(*) from auditoria where tabela = 'orgaos_publicos' and registro_id = org and operacao = 'DELETE') = 1,
    'exclusão de órgão não ficou na auditoria');
end $$;

rollback;
