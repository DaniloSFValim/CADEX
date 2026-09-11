# Arquitetura

## Princípio: o banco é o sistema

A regra de negócio não mora no React nem numa camada de serviço — mora no
PostgreSQL, como `check`, trigger, função `security definer` ou policy de
RLS. O frontend é um cliente que fala PostgREST sob a identidade do usuário
autenticado.

Isso não é preferência estética. Num sistema que sustenta decisão
administrativa, a pergunta relevante é: *o que acontece se alguém chamar a
API diretamente?* Com a regra no cliente, a resposta é "passa". Com a regra
no banco, a resposta é "o banco recusa" — e é a mesma resposta para o
navegador, para um `curl` com a `anon key` (que é pública por desenho) e
para um insider.

Consequência prática: `supabase/tests/03_rls.sql` roda como papel **não
superusuário**. Um teste de RLS executado como superusuário passa sempre e
não prova nada.

## Camadas

```
Navegador  ── React 18 + Vite + Tailwind + MapLibre
               │  supabase-js (JWT do usuário)
               ▼
PostgREST  ── expõe SOMENTE o schema `public`
               │  RLS aplicada em toda leitura e escrita
               ▼
PostgreSQL ── 36 tabelas · PostGIS · triggers · funções de domínio
               schema `cadex` = lógica interna, NÃO exposta
               schema `storage` = arquivos, buckets privados
```

O schema `cadex` concentra funções de domínio (`approve_company`,
`start_intervention`, `run_deadline_sweep`, `has_role`…) e **não é
exposto** pelo PostgREST (`config.toml: schemas = ["public"]`). O que a
aplicação precisa chamar aparece como wrapper `*_rpc` em `public`, e cada
wrapper reaplica a checagem de papel.

## Decisões e o que foi recusado

| Decisão | Alternativa recusada | Motivo |
|---|---|---|
| Regra no banco | validar no cliente / numa API Node | cliente é adulterável; API extra é mais uma camada para manter em sincronia |
| `geometry(Geometry, 4326)` | colunas `lat`/`lng` | a especificação exige linha, polígono e trecho; ponto textual não comporta consulta espacial |
| Token opaco público | expor o UUID da intervenção | UUID interno em QR Code afixado em via pública vira superfície de enumeração |
| `snapshot` jsonb na intervenção | consultar a empresa no momento da leitura | a empresa muda de status; o histórico da intervenção não pode mudar junto |
| Grafo de subcontratação | coluna `parent_id` com nível fixo | a especificação proíbe limitar a profundidade |
| `system_parameters` | prazos como constante | prazo normativo muda por ato administrativo, não por deploy |
| Blocos `DO` com assertiva | pgTAP | pgTAP exige extensão no servidor; o ganho não compensa a dependência |
| Enum para status | tabela de status | os estados vêm da norma e não são configuráveis pelo usuário; enum dá erro em tempo de escrita |
| Tabela para qualificações | enum | a especificação exige qualificações configuráveis |

## Os quatro workflows

Obra, manutenção e emergência compartilham **um núcleo georreferenciado**
(`interventions`) e **nada mais**: cada uma tem tabela, enum de status e
regras próprias. O núcleo comum existe para que mapa, fiscalização e
consulta pública tratem qualquer intervenção uniformemente — não para
unificar procedimentos que a norma separa.

O quarto workflow é o do CADEX, que é pré-condição dos outros três.

## Auditoria

Trigger genérico `cadex.audit_row()` em 14 tabelas sensíveis, gravando
valor anterior e novo em `audit_logs`. Um segundo trigger bloqueia UPDATE
e DELETE na própria tabela de log — inclusive para o admin. Só um
superusuário do banco contorna, e isso fica registrado na infraestrutura.
