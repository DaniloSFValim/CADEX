# Deploy

## Estado

**Backend: aplicado.** O projeto Supabase `cadex-niteroi`
(`jqgcgaalqabmnevadqfy`, região `sa-east-1`) recebeu as 10 migrations e
foi verificado: 37 tabelas, RLS habilitada e forçada em todas, 71
policies, 6 buckets privados, PostGIS isolado no schema `extensions`, e o
linter de segurança do Supabase sem nenhuma das falhas reais (os avisos
remanescentes são as duas views públicas e as duas funções de verificação,
ambas deliberadas e documentadas).

**Frontend: pendente de publicação por você.** O conector Cloudflare da
sessão de desenvolvimento expõe apenas leitura de Workers e criação de
D1/KV/R2; não há ferramenta de deploy nem `wrangler` no ambiente. Os
arquivos necessários já estão no repositório — ver a seção 5.

O seed de demonstração **não** foi aplicado ao projeto: ele é de
desenvolvimento.

## 1. Projeto Supabase

```bash
supabase login
supabase link --project-ref <ref-do-projeto>
supabase db push            # aplica supabase/migrations/ em ordem
```

Verifique no SQL Editor:

```sql
select extname from pg_extension where extname in ('postgis','pgcrypto');
select count(*) from pg_policies where schemaname = 'public';   -- deve ser > 40
select count(*) from storage.buckets where public = true;       -- deve ser 0
```

**Não aplique `supabase/seed/demo.sql` em produção.** Ele existe para
desenvolvimento e marca tudo com `demo = true` e prefixo `[DEMO]`.

## 2. Primeiro administrador

```sql
-- após criar o usuário pelo painel de Auth:
insert into profiles (id, full_name, email, org_unit)
values ('<uuid-do-usuario>', 'Nome', 'email@municipio.gov.br', 'SECONSER');
insert into user_roles (user_id, role) values ('<uuid-do-usuario>', 'admin');
```

Autocadastro está desabilitado (`config.toml`); todas as contas nascem
pela administração.

## 3. Parâmetros normativos

Confira `system_parameters` contra o texto oficial da Resolução e preencha
`legal_basis` em cada linha. Carregue os feriados:

```sql
insert into holidays (date, name, scope, recurring) values
  ('2027-01-01','Confraternização Universal','nacional', true);
  -- ... demais feriados nacionais, estaduais e municipais
```

Sem isso, o cálculo de dias úteis considera apenas fins de semana.

## 4. Agendamento da varredura de prazos

Opção A — `pg_cron` no próprio Supabase:

```sql
create extension if not exists pg_cron;
select cron.schedule('cadex-deadlines', '0 6 * * *',
                     $$select cadex.run_deadline_sweep()$$);
```

Opção B — Edge Function ou cron externo chamando a RPC com a
`service_role` key. Nunca com a `anon key`.

A função é idempotente: rodar duas vezes no mesmo dia não duplica
notificação.

## 5. Frontend — Cloudflare

O repositório já traz o que falta: `wrangler.toml` (com
`not_found_handling = "single-page-application"`) e `public/_redirects`,
que o Vite copia para `dist/`. Os dois existem pelo mesmo motivo: sem
fallback de SPA, `/verificar/<token>` — a URL que o QR Code afixado no
canteiro abre (art. 14) — responde 404 em vez da placa digital.

**Opção A — Workers, pela sua máquina:**

```bash
echo "VITE_SUPABASE_URL=https://jqgcgaalqabmnevadqfy.supabase.co"  > .env
echo "VITE_SUPABASE_ANON_KEY=<chave publicavel do painel>"        >> .env
npm ci && npm run build
npx wrangler login
npx wrangler deploy
```

**Opção B — Pages, ligado ao GitHub** (recomendada: publica a cada push):

- Cloudflare → Workers & Pages → Create → Pages → Connect to Git
- Repositório `DaniloSFValim/CADEX`, branch `main`
- Build command: `npm run build` · Output directory: `dist`
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

Já existe um Worker chamado `cadex` na conta, criado em 30/07/2026. Não
foi tocado: verifique se deve ser substituído ou se convém outro nome.

## 6. Validação pós-deploy

- [ ] Login com o usuário administrador
- [ ] Painel administrativo carrega indicadores (`dashboard_metrics`)
- [ ] Portal público abre sem login e o mapa renderiza
- [ ] `/verificar/<token>` responde para um token existente
- [ ] Um usuário de empresa **não** enxerga dados de outra empresa
- [ ] Upload em bucket privado e leitura por signed URL
- [ ] `select cadex.run_deadline_sweep();` retorna contagens
