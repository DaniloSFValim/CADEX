# Deploy

## Estado

**Backend: aplicado até a migration 10.** O projeto Supabase
`cadex-niteroi` (`jqgcgaalqabmnevadqfy`, região `sa-east-1`) recebeu as
migrations 01 a 10 e foi verificado: 37 tabelas, RLS habilitada e forçada
em todas, 71 policies, 6 buckets privados, PostGIS isolado no schema
`extensions`, e o linter de segurança do Supabase sem nenhuma das falhas
reais (os avisos remanescentes são as duas views públicas e as duas
funções de verificação, ambas deliberadas e documentadas).

> ### ⚠️ Passo 1.1 — aplicar as migrations 11 a 14
>
> Estão no repositório e **não** no projeto. São, em ordem:
>
> | Migration | O que faz | Consequência de não aplicar |
> |---|---|---|
> | `11_autoridade_decisoria` | impede que o requerente defira a própria licença, retroaja o registro da autodeclaração ou se declare regularizado; exige os documentos do art. 12 no protocolo | **uma empresa emite a própria licença de obra** |
> | `12_storage_license_documents` | dá à empresa permissão de escrita no bucket `license-documents` | ela não consegue instruir o pedido (art. 12) |
> | `13_license_draft_rpc` | devolve o rascunho com geometria em GeoJSON | o formulário não reabre rascunho salvo |
> | `14_partes_intervencao` | `is_company_active` passa a SECURITY DEFINER | **nenhuma empresa consegue nomear contratante ou subcontratada** (art. 11) |
>
> `supabase db push` aplica as quatro em ordem. Alternativa sem CLI: colar
> o conteúdo de cada arquivo no SQL Editor, na ordem numérica.
>
> Não há dado de produção a migrar — o usuário administrador ainda não foi
> criado. Depois de aplicar, confira:
>
> ```sql
> select count(*) from pg_trigger
>  where tgname in ('trg_license_authority','trg_license_instruction',
>                   'trg_emergency_authority','trg_emergency_timeline');
> -- deve ser 4
>
> select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
>  where n.nspname = 'cadex' and p.proname = 'is_company_active';
> -- deve ser true
> ```

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

Autocadastro está desabilitado (`config.toml`): todas as contas nascem
pela administração. São dois passos, ambos no painel do Supabase.

**2.1 — Criar a conta.**
https://supabase.com/dashboard/project/jqgcgaalqabmnevadqfy/auth/users

Botão **Add user** → **Create new user**. Marque **Auto Confirm User**:
sem isso a conta fica aguardando confirmação por e-mail, e não há
provedor de e-mail configurado.

**2.2 — Conceder o papel.**
https://supabase.com/dashboard/project/jqgcgaalqabmnevadqfy/sql/new

```sql
insert into profiles (id, full_name, email, org_unit)
select id, 'Nome Completo', email, 'SECONSER'
  from auth.users where email = 'pessoa@municipio.gov.br'
on conflict (id) do nothing;

insert into user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'pessoa@municipio.gov.br'
on conflict do nothing;
```

A busca é por e-mail justamente para não depender de copiar UUID.

Sem o segundo INSERT a conta autentica e não enxerga nada: as policies
de RLS avaliam papéis, e usuário sem papel não satisfaz nenhuma delas.
Isso não é falha — é o comportamento correto de negação por padrão.

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

**Opção A — Workers, pela sua máquina.** `wrangler` é uma ferramenta de
linha de comando: roda no seu computador, num clone do repositório. Não
há equivalente no painel do Cloudflare.

```bash
git clone https://github.com/DaniloSFValim/CADEX.git && cd CADEX

cat > .env <<'FIM'
VITE_SUPABASE_URL=https://jqgcgaalqabmnevadqfy.supabase.co
VITE_SUPABASE_ANON_KEY=<chave publicavel>
FIM

npm ci && npm run build
npx wrangler login     # abre o navegador para autorizar
npx wrangler deploy
```

A chave publicável está no painel, em **Project Settings → API Keys**.
Ela é pública por desenho — segue no bundle do navegador de qualquer
modo; quem protege os dados é a RLS, não o sigilo da chave.

**Opção B — Pages, ligado ao GitHub** (recomendada: publica a cada push,
e dispensa terminal):

- https://dash.cloudflare.com → **Workers & Pages** → **Create** → aba
  **Pages** → **Connect to Git**
- Repositório `DaniloSFValim/CADEX`, branch `main`
- Build command: `npm run build` · Output directory: `dist`
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

**Colisão de nome.** Já existe um Worker chamado `cadex` na conta, criado
em 30/07/2026, que não foi tocado. O `wrangler.toml` usa exatamente esse
nome e **sobrescreveria** aquele Worker. Se ele ainda serve para algo,
altere o campo `name` antes de publicar.

## 6. Validação pós-deploy

- [ ] Login com o usuário administrador
- [ ] Painel administrativo carrega indicadores (`dashboard_metrics`)
- [ ] Portal público abre sem login e o mapa renderiza
- [ ] `/verificar/<token>` responde para um token existente
- [ ] Um usuário de empresa **não** enxerga dados de outra empresa
- [ ] Upload em bucket privado e leitura por signed URL
- [ ] `select cadex.run_deadline_sweep();` retorna contagens
