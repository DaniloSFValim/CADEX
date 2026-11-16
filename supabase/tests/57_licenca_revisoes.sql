-- =====================================================================
-- Revisão de pendências: aceitar um aviso exige motivo de 3 a 500 caracteres,
-- e o aviso aceito fica registrado com quem aceitou e quando.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000057', 'gestor.t57@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-000000000057', 'Gestor T57', 'gestor');
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000057', true);

do $$
declare
  lic uuid;
  n int;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Empresa T57 Ltda.', 'EmpT57', 'operadora', 'e57@m.test');

  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'PROC-T57', 'numero', '903/2026', 'tipos_obra', array['vala'], 'escopo', 'Revisão T57',
      'executora_id', (select id from empresas where cnpj = '12345678000195'), 'protocolo_data', '2026-03-01',
      'situacao', 'deferida', 'inicio_previsto', '2026-03-10', 'fim_previsto', '2026-04-10'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua T57', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));
  select id into lic from licencas where numero = '903/2026';

  insert into licenca_revisoes (licenca_id, aviso, motivo)
  values (lic, 'Fim da obra ou serviço vencido, sem conclusão registrada.', 'Obra concluída, conclusão registrada na prefeitura.');
  select count(*) into n from licenca_revisoes where licenca_id = lic and revisado_por = '00000000-0000-4000-8000-000000000057';
  perform pg_temp.assert(n = 1, 'o aceite deveria registrar quem aceitou');

  begin
    insert into licenca_revisoes (licenca_id, aviso, motivo) values (lic, 'Outro aviso', 'ok');
    raise exception 'ASSERT FALHOU: motivo curto foi aceito';
  exception when check_violation then null;
  end;

  begin
    insert into licenca_revisoes (licenca_id, aviso, motivo)
    values (lic, 'Fim da obra ou serviço vencido, sem conclusão registrada.', 'Repetido, não pode.');
    raise exception 'ASSERT FALHOU: o mesmo aviso foi aceito duas vezes';
  exception when unique_violation then null;
  end;
end $$;

rollback;
