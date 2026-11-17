-- =====================================================================
-- Validade da licença: sempre início + 30 (nunca a partir do protocolo).
-- Licença cuja obra ainda não começou fica "aguardando início", mesmo com
-- protocolo antigo; depois do início, "em execução" até o fim do prazo.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000056', 'gestor.t56@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-000000000056', 'Gestor T56', 'gestor');
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000056', true);

do $$
declare
  j licencas;
  ex uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Empresa T56 Ltda.', 'EmpT56', 'operadora', 'e56@m.test') returning id into ex;
  -- Protocolado em outubro, obra começa em dezembro: validade vira 30 dias a partir do início.
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'PROC-T56-A', 'numero', '901/2026', 'tipos_obra', array['vala'], 'escopo', 'Futura T56',
      'executora_id', ex, 'protocolo_data', '2026-10-01', 'situacao', 'deferida',
      'inicio_previsto', '2026-12-01', 'fim_previsto', '2026-12-31'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua T56 A', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));

  select * into j from licencas where numero = '901/2026';
  perform pg_temp.assert(j.validade_ate = date '2026-12-31', 'validade deveria ser início + 30, não o protocolo + 30');
  perform pg_temp.assert(public.situacao_publica(j, date '2026-11-16', false) = 'aguardando_inicio',
    'licença com início futuro deveria estar aguardando início, mesmo com protocolo antigo');

  -- Obra começou em outubro e o fim previsto passou em outubro: no público, encerrada pela data.
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'PROC-T56-B', 'numero', '902/2026', 'tipos_obra', array['vala'], 'escopo', 'Vencida T56',
      'executora_id', ex, 'protocolo_data', '2026-09-01', 'situacao', 'deferida',
      'inicio_previsto', '2026-10-01', 'fim_previsto', '2026-10-31'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua T56 B', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));

  select * into j from licencas where numero = '902/2026';
  perform pg_temp.assert(j.validade_ate = date '2026-10-31', 'validade de licença vencida deveria ser início + 30');
  perform pg_temp.assert(public.situacao_publica(j, date '2026-11-16', false) = 'encerrada',
    'licença com fim previsto passado deveria estar encerrada no público');
end $$;

rollback;
