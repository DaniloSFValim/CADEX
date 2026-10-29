-- =====================================================================
-- Telecom: caixa R2 e galeria estão no catálogo, ativos, com a fonte do art. 10.
-- =====================================================================
begin;

do $$
begin
  if (select count(*) from tipos_intervencao
       where setor = 'telecom' and codigo in ('caixa_r_dois', 'galeria')
         and ativo and fonte = 'Art. 10 da Resolução (setor de telecomunicações).') <> 2 then
    raise exception 'ASSERT FALHOU: caixa R2 e galeria devem estar no catálogo de telecom, ativos, com a fonte do art. 10';
  end if;
end $$;

rollback;
