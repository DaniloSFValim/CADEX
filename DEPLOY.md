# Deploy

> **Este deploy não foi executado.** Nenhuma credencial de Supabase ou de
> hospedagem foi fornecida a esta sessão, e o conector Cloudflare
> disponível está não autorizado — a autorização OAuth precisa ser feita
> pela pessoa usuária. O roteiro abaixo foi escrito para ser executado sem
> adaptação assim que as credenciais existirem.

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

## 5. Frontend

```bash
npm ci && npm run build     # gera dist/
```

Publique `dist/` em qualquer host estático (Cloudflare Pages, Vercel,
Nginx), com as variáveis de build definidas no painel do provedor.

Exige **fallback de SPA**: toda rota não encontrada serve `index.html`.
Sem isso, `/verificar/<token>` — a URL do QR Code afixado em via pública —
retorna 404.

## 6. Validação pós-deploy

- [ ] Login com o usuário administrador
- [ ] Painel administrativo carrega indicadores (`dashboard_metrics`)
- [ ] Portal público abre sem login e o mapa renderiza
- [ ] `/verificar/<token>` responde para um token existente
- [ ] Um usuário de empresa **não** enxerga dados de outra empresa
- [ ] Upload em bucket privado e leitura por signed URL
- [ ] `select cadex.run_deadline_sweep();` retorna contagens
