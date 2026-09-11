# CADEX — Controle de Intervenções em Espaço Público

Plataforma municipal para habilitação de empresas (CADEX) e controle de
intervenções em vias públicas, subsolo e espaço aéreo: obras licenciadas,
manutenção rotineira autodeclarada, atendimentos emergenciais, fiscalização
de campo e consulta pública georreferenciada.

---

## ⚠️ Leia antes de tudo: o texto da Resolução não foi fornecido

O escopo deste sistema é a **Resolução Conjunta SECONSER/SEOP nº 001, de
09/09/2026**, indicada como fonte normativa de verdade. **O arquivo não
chegou a esta sessão de desenvolvimento** — a busca no repositório e no
ambiente não localizou nenhum documento correspondente, e o repositório
estava vazio.

Consequências práticas, declaradas abertamente em vez de disfarçadas:

1. **Nenhum número de artigo foi inventado.** Não há, em nenhum arquivo
   deste repositório, uma citação do tipo "art. 12 da Resolução". Onde
   um artigo deveria ser referenciado, o campo está nulo e marcado como
   pendente em [`COMPLIANCE-MATRIX.md`](COMPLIANCE-MATRIX.md).
2. **Todo prazo é parâmetro, não constante.** Os valores (15 dias úteis,
   12 meses, 30 dias, 20 dias úteis, 24 horas, 60 dias) vieram da
   especificação funcional recebida, **não do texto legal**, e estão na
   tabela `system_parameters`, editáveis sem recompilar nem migrar. Ao
   conferir o texto oficial, corrige-se o valor e preenche-se
   `legal_basis` — nenhuma linha de código muda.
3. **Regras que dependem de redação exata ficaram registradas como
   pendentes**, não adivinhadas. A lista está na seção "Regras pendentes
   de definição administrativa" da matriz de conformidade.

**Para destravar:** coloque o PDF/DOCX da Resolução em `docs/normativo/`
e solicite a revisão. A matriz de conformidade é o artefato a ser
preenchido artigo a artigo.

## Estado real da entrega

Este repositório contém as **Fases 1 a 3 completas e partes das Fases 4 a 8**
do plano de 10 fases. É uma fundação executável e testada, não o sistema
inteiro. A tabela abaixo é o estado verificado, não uma projeção.

| Área | Situação | Verificação |
|---|---|---|
| Modelo de dados (36 tabelas, PostGIS) | ✅ funciona | migrations aplicam em Postgres 16 + PostGIS 3 |
| RBAC + RLS (7 perfis) | ✅ funciona | `03_rls.sql` prova isolamento entre empresas e bloqueio de escalação |
| Regras de negócio no banco | ✅ funciona | 3 suítes SQL, todas passando |
| Motor de prazos e notificações | ✅ funciona | varredura idempotente testada |
| Camada pública LGPD (views + RPC) | ✅ funciona | teste prova ausência de dado pessoal e bloqueio de `anon` nas tabelas |
| Consulta espacial / mapa | ✅ funciona | `interventions_near` testada; MapLibre consome GeoJSON do PostGIS |
| Portal público, painel admin, painel da empresa, telas de campo, CISP | ✅ compila e consulta dados reais | `tsc`, `vitest`, `vite build` verdes |
| Storage privado + políticas | ⚠️ escrito, **não executado** | schema `storage` só existe em projeto Supabase real |
| Licenciamento: formulário de 6 etapas, desenho no mapa, import GeoJSON/KML | ❌ não implementado | back-end pronto; falta a UI |
| Geração de PDF e QR Code (licença, OS, crachá) | ❌ não implementado | tokens e rotas de verificação existem e funcionam |
| As Built (UI), equipes/veículos (UI), painel administrativo de parâmetros | ❌ não implementado | tabelas, regras e RLS prontas |
| E2E (Playwright) | ❌ não implementado | — |
| Deploy em produção | ❌ **não realizado** | ver "Por que não há URL de produção" |

### Por que não há URL de produção

Deploy real exige um projeto Supabase (URL + chaves + banco) e uma conta de
hospedagem. Nenhuma credencial foi fornecida a esta sessão, e o conector
Cloudflare disponível está **não autorizado** — a autorização OAuth precisa
ser feita pela pessoa usuária, não pode ser feita a partir daqui. O caminho
completo, comando a comando, está em [`DEPLOY.md`](DEPLOY.md); ele foi
escrito para ser executado sem adaptação assim que as credenciais existirem.

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
npm run db:test     # migrations + seed + 3 suítes SQL
```

Resultado atual: tudo verde. Reproduza antes de confiar.

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
