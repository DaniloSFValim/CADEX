# CADEX — Controle de Intervenções em Espaço Público

Plataforma municipal para habilitação de empresas (CADEX) e controle de
intervenções em vias públicas, subsolo e espaço aéreo: obras licenciadas,
manutenção rotineira autodeclarada, atendimentos emergenciais, fiscalização
de campo e consulta pública georreferenciada.

---

## Conformidade normativa

Fonte de verdade: **Resolução Conjunta SECONSER/SEOP nº 001, de 09 de
setembro de 2026** — Município de Niterói, com fundamento na Lei
Municipal nº 3.988/2025.

O articulado foi conferido dispositivo a dispositivo. A rastreabilidade
está em [`COMPLIANCE-MATRIX.md`](COMPLIANCE-MATRIX.md), que hoje cita o
artigo de cada regra — não há mais coluna em branco. Todo prazo e toda
exigência documental carregam `legal_basis` no próprio banco, e há teste
que falha se um catálogo ganhar item sem fundamento.

### Divergência corrigida na conferência

**Art. 20 — as 24 horas correm da conclusão do atendimento, não do
acionamento do CISP.** A primeira implementação contava do acionamento.
Num atendimento de 10 horas, isso esgotaria o prazo 10 horas cedo demais
e poderia gerar autuação indevida (Anexo Único, inciso III, da Lei nº
3.988/2025). Corrigido na migration 07, com teste que fixa o
comportamento.

Outros oito ajustes decorreram da leitura — entre eles o trecho passar a
exigir coordenadas de início e fim (art. 2º, VII), a unificação de
"equipamentos e contingente de pessoal técnico" num só documento (art.
6º, II, "c"), o conteúdo obrigatório da comunicação ao 153 (art. 19,
§ 1º), a subscrição da ordem de serviço (art. 25) e a correção do
município, que estava no Rio de Janeiro em vez de **Niterói**.

Três omissões já foram resolvidas por decisão administrativa (art. 30) e
estão registradas na tabela `normative_decisions`, com fundamento e efeito
concreto — auditáveis e reversíveis por ato da mesma autoridade, não por
edição de código. Sete pontos seguem pendentes e estão listados ao final
da matriz. Nenhum foi adivinhado.

## Estado real da entrega

Este repositório contém as **Fases 1 a 3 completas e partes das Fases 4 a 8**
do plano de 10 fases. É uma fundação executável e testada, não o sistema
inteiro. A tabela abaixo é o estado verificado, não uma projeção.

| Área | Situação | Verificação |
|---|---|---|
| Modelo de dados (36 tabelas, PostGIS) | ✅ funciona | migrations aplicam em Postgres 16 + PostGIS 3 |
| Aderência ao articulado | ✅ conferida | `04_resolucao_001_2026.sql` — 14 blocos de assertiva |
| Decisões do art. 30 | ✅ registradas e travadas | `normative_decisions` + `05_decisoes_art30.sql` |
| RBAC + RLS (7 perfis) | ✅ funciona | `03_rls.sql` prova isolamento entre empresas e bloqueio de escalação |
| Regras de negócio no banco | ✅ funciona | 5 suítes SQL, todas passando |
| Motor de prazos e notificações | ✅ funciona | varredura idempotente testada |
| Camada pública LGPD (views + RPC) | ✅ funciona | teste prova ausência de dado pessoal e bloqueio de `anon` nas tabelas |
| Consulta espacial / mapa | ✅ funciona | `interventions_near` testada; MapLibre consome GeoJSON do PostGIS |
| Portal público, painel admin, painel da empresa, telas de campo, CISP | ✅ compila e consulta dados reais | `tsc`, `vitest`, `vite build` verdes |
| Storage privado + políticas | ✅ aplicado | 6 buckets privados, 5 políticas, verificados no projeto real |
| Licenciamento: formulário de 6 etapas, desenho no mapa, import GeoJSON/KML | ❌ não implementado | back-end pronto; falta a UI |
| Geração de PDF e QR Code (licença, OS, crachá) | ❌ não implementado | tokens e rotas de verificação existem e funcionam |
| As Built (UI), equipes/veículos (UI), painel administrativo de parâmetros | ❌ não implementado | tabelas, regras e RLS prontas |
| E2E (Playwright) | ❌ não implementado | — |
| Backend em produção (Supabase) | ✅ **no ar** | 10 migrations aplicadas; linter de segurança limpo das falhas reais |
| Frontend em produção (Cloudflare) | ❌ **não publicado** | o conector não expõe deploy — ver abaixo |

### Estado do deploy

**Backend: no ar.** Projeto Supabase `cadex-niteroi` (região `sa-east-1`),
com as 10 migrations aplicadas e verificadas: 37 tabelas, RLS habilitada
e **forçada** em todas, 71 policies, 6 buckets privados, PostGIS com 439
funções isoladas no schema `extensions`.

**Frontend: não publicado.** O conector Cloudflare desta sessão expõe
apenas leitura de Workers (`list`, `get`, `get_code`) e criação de
D1/KV/R2 — **não há ferramenta de deploy ou upload de script**, e não há
`wrangler` nem token de API no ambiente. Não é falta de permissão: a
capacidade não existe. O repositório já traz `wrangler.toml` e
`public/_redirects` prontos; publicar é `npm run build && npx wrangler
deploy` na sua máquina, ou conectar o repositório ao Cloudflare Pages.
Passo a passo em [`DEPLOY.md`](DEPLOY.md).

### Três falhas de segurança que só o deploy real revelou

A suíte local passava porque rodava como **superusuário**, que ignora RLS
e ignora GRANT, e porque o Postgres local não reproduz os
privilégios-padrão do Supabase:

1. `work_orders` tinha RLS forçada e **nenhuma policy** — o módulo de
   Ordem de Serviço estava inacessível a todos os papéis.
2. `anon` podia executar **todas** as RPC: o PostgreSQL concede EXECUTE a
   PUBLIC por padrão, e duas funções não checavam papel internamente.
3. `anon` tinha SELECT em **todas** as tabelas, por privilégio-padrão do
   Supabase. A RLS barrava as linhas, mas a defesa dependia de uma só
   camada — e a documentação afirmava o contrário.

Corrigidas nas migrations 09 e 10, com testes que travam o
comportamento — incluindo um genérico que falha se qualquer tabela ficar
com RLS sem policy. Detalhes em [`SECURITY.md`](SECURITY.md).

Não há nenhum fallback para dados simulados: sem backend configurado, o app
exibe uma tela dizendo isso e não finge funcionar.

---

## Arquitetura em uma frase

Toda regra de negócio vive no PostgreSQL — como `check`, trigger, função ou
policy de RLS — e o React é um cliente que **não pode** burlá-la, porque
fala com o banco pelo PostgREST sob a identidade do usuário autenticado.

Um cliente adulterado, um `curl` com a `anon key` (que é pública por
desenho) ou um insider curioso esbarram na mesma barreira. Os testes em
`supabase/tests/03_rls.sql` rodam como papel **não superusuário**
justamente porque um teste de RLS rodando como superusuário não prova nada.

Detalhes em [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Stack

| Camada | Escolha |
|---|---|
| Banco | PostgreSQL 16 + PostGIS 3 |
| Backend | Supabase (PostgREST, GoTrue, Storage, RLS) |
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS |
| Mapa | MapLibre GL |
| Testes | Vitest (unidade) + suíte SQL própria (regras e RLS) |

Nenhuma substituição foi feita em relação à stack sugerida. A única decisão
que merece registro: **não foi adotado pgTAP** na suíte SQL, por exigir
extensão adicional no servidor; os testes usam blocos `DO` com assertivas
que abortam a transação — mesmo poder de detecção, zero dependência.

## Executar localmente

```bash
# 1. Banco + migrations + seed + testes (não precisa de Supabase nem rede)
bash scripts/test-db.sh

# 2. Frontend
npm install
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Para um Supabase local completo (auth, storage, studio):

```bash
supabase start
supabase db reset         # aplica migrations + seed
```

## Verificação

```bash
npm run typecheck   # tsc --noEmit
npm test            # 14 testes de regra no cliente
npm run build       # build de produção
npm run db:test     # migrations + seed + 5 suítes SQL
```

Resultado atual: tudo verde (5 suítes SQL, 14 testes de unidade, typecheck e build). Reproduza antes de confiar.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Camadas, decisões e o que foi deliberadamente recusado |
| [DATABASE.md](DATABASE.md) | Entidades, relacionamentos, funções e triggers |
| [BUSINESS-RULES.md](BUSINESS-RULES.md) | Cada regra e onde ela é aplicada no banco |
| [WORKFLOWS.md](WORKFLOWS.md) | Os quatro workflows e seus estados |
| [SECURITY.md](SECURITY.md) | RBAC, RLS, storage, uploads, auditoria |
| [GIS.md](GIS.md) | Geometrias, SRID, base cartográfica, formatos |
| [COMPLIANCE-MATRIX.md](COMPLIANCE-MATRIX.md) | Requisito → implementação → teste, com pendências |
| [DEPLOY.md](DEPLOY.md) | Passo a passo de produção |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Variáveis e segredos |
| [TESTING.md](TESTING.md) | Estratégia e cobertura real |
