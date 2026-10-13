-- =====================================================================
-- CADEX — empresa titular que executa a própria obra ou serviço
--
-- O cadastro da empresa (operadora, concessionária, construtora) passa a
-- dizer se ela executa obra ou serviço por conta própria (executa_obras).
-- Só com essa marca a licença aceita a mesma empresa como contratante e
-- executora ("A própria contratante executará a obra ou serviço").
--
-- * Terceirizada não recebe a marca: ela já é, por definição, executora.
-- * Padrão falso. Empresa que JÁ consta como contratante e executora de
--   alguma licença é marcada na migração, para o cadastro refletir o que
--   já foi registrado; nada mais é alterado.
-- * A verificação vale para a licença NOVA ou para a que mudar de
--   contratante/executora. Registro antigo segue editável sem a marca.
--
-- Reversão: remover o gatilho licencas_exige_autoexecucao_habilitada e a
-- coluna empresas.executa_obras. Nenhum dado de licença é alterado.
-- =====================================================================

alter table public.empresas
  add column if not exists executa_obras boolean not null default false;

alter table public.empresas
  add constraint empresas_executa_obras_so_titular
  check (not (executa_obras and tipo = 'terceirizada'));

comment on column public.empresas.executa_obras is
  'A titular (operadora, concessionária, construtora) executa obra ou serviço por conta própria; habilita contratante = executora na licença.';

update public.empresas e set executa_obras = true
 where e.tipo <> 'terceirizada'
   and exists (select 1 from public.licencas l where l.contratante_id = e.id and l.executora_id = e.id);

create or replace function public.licencas_exige_autoexecucao_habilitada()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.contratante_id is not null and new.contratante_id = new.executora_id
     and (tg_op = 'INSERT'
          or old.contratante_id is distinct from new.contratante_id
          or old.executora_id is distinct from new.executora_id) then
    if not exists (select 1 from public.empresas where id = new.executora_id and executa_obras) then
      raise exception 'Esta empresa não está cadastrada como executora de obra ou serviço próprio. Marque a opção no cadastro da empresa, ou escolha uma terceirizada como executora.';
    end if;
  end if;
  return new;
end $$;

create or replace trigger licencas_exige_autoexecucao
  before insert or update on public.licencas
  for each row execute function public.licencas_exige_autoexecucao_habilitada();
