-- =====================================================================
-- CADEX — 14: nomear as partes do art. 11 tem de ser possível
--
-- O art. 11 obriga a distinguir concessionária contratante, empresa
-- executora e subcontratada. O trigger `check_intervention_parties` exige
-- que todas tenham CADEX ativo e chama `cadex.is_company_active` para
-- verificar.
--
-- `is_company_active` foi escrita como função SQL comum — SECURITY
-- INVOKER. Ela roda, portanto, sob a RLS de quem a chamou. E a policy de
-- `companies` diz que uma empresa só enxerga a si própria. Logo, quando a
-- executora registrava a intervenção nomeando a concessionária, a função
-- não encontrava a linha da concessionária, `exists` devolvia falso e o
-- trigger recusava com "Concessionária contratante sem CADEX ativo" —
-- sobre uma empresa que estava, de fato, ativa.
--
-- O efeito era que nenhuma empresa conseguia registrar intervenção com
-- contratante ou subcontratada: exatamente a hipótese que o art. 11 existe
-- para disciplinar. A suíte não pegou porque inseria como superusuário,
-- que ignora RLS; apareceu ao percorrer o formulário de licenciamento
-- como uma empresa de verdade.
--
-- As funções de decisão de acesso deste sistema (`has_role`, `is_staff`,
-- `current_company_id`, `can_see_intervention`) já são SECURITY DEFINER
-- pelo mesmo motivo: se a verificação depender da visibilidade de quem
-- pergunta, ela responde errado. `is_company_active` ficou de fora.
--
-- Não há vazamento em corrigir: a função devolve um booleano sobre fato
-- que o art. 7º, § 2º manda publicar — a relação das empresas com CADEX
-- ativo já é pública em `public_companies`, inclusive para `anon`.
-- =====================================================================

set search_path = public, extensions;

create or replace function cadex.is_company_active(p_company_id uuid)
returns boolean language sql stable security definer
set search_path = public, cadex, extensions as $$
  select exists (
    select 1 from companies c
    where c.id = p_company_id
      and c.status in ('ativo','proximo_vencimento')
      and c.valid_until >= current_date
  );
$$;

comment on function cadex.is_company_active(uuid) is
  'Art. 7º, § 2º c/c art. 11: habilitação vigente de uma empresa. SECURITY DEFINER '
  'porque é consultada sobre TERCEIROS (contratante, subcontratada), que a RLS '
  'esconde de quem pergunta. Devolve apenas o que a publicação do art. 7º já expõe.';

-- A função é chamada por triggers, não pelo cliente: não há porta de
-- entrada por PostgREST, e não se abre uma.
revoke execute on function cadex.is_company_active(uuid) from public;
revoke execute on function cadex.is_company_active(uuid) from anon;

-- O trigger roda com os privilégios de quem grava. Sem este GRANT, o
-- REVOKE acima faria o cadastro de obras e serviços falhar com
-- "permission denied" para todo usuário logado.
grant  execute on function cadex.is_company_active(uuid) to authenticated;
