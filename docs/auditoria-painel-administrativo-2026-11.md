# Auditoria do painel administrativo do CADEX — novembro de 2026

Escopo: navegação, permissões (frontend, funções e políticas do banco), painel, gestão de licenças e empresas, trilha de auditoria, exportação e integridade dos dados de produção.
Método: leitura do código, consultas **somente leitura** ao banco de produção (`cadex-niteroi`), advisors de segurança e desempenho do Supabase, e as suítes de teste (unidade, tela e regras do banco).
Nenhum dado de produção foi alterado nesta auditoria.

## 1. Problemas identificados, por prioridade

### Crítica

| # | Problema | Evidência | Situação |
|---|---|---|---|
| C1 | O **gestor apagava empresa direto pela API** (`DELETE`), pulando as regras de `admin_excluir_empresa` (que recusa empresa habilitada e ativa, e empresa com licença). A exclusão levava em cascata documentos, vínculos, histórico de situação, responsáveis técnicos, funcionários e veículos. | Política `empresas_excluir` (`is_gestor()`) e `DELETE` concedido a `authenticated`. Teste novo no `23_excluir_empresa.sql` **falha sem a correção** (o gestor apaga a empresa) e passa com ela. | Corrigido por migração (seção 5). **Falta aplicar em produção.** |

Verificado e **sem problema**: licenças. A política de `DELETE` existe, mas o gatilho `licencas_protege_lixeira` recusa qualquer exclusão direta que não venha da função do administrador, depois da lixeira. O teste 18 já cobria esse caso.

### Alta

| # | Problema | Situação |
|---|---|---|
| A1 | O **histórico de correções em lote não tinha tela**. O motivo de cada correção fica gravado em `licencas_correcoes`, mas nenhuma tela mostrava esse registro. | Corrigido: card "Histórico de correções" em Administração › Manutenção. |
| A2 | **Datas incoerentes em licenças legadas.** Há 14 licenças com validade anterior ao fim previsto. Em pelo menos 5 delas, o início está um ano à frente da própria validade, o que parece erro de digitação do ano. Com isso, essas obras aparecem no ano errado no painel e na linha do tempo pública. | **Não corrigido**: precisa de conferência no processo (seção 8). |

### Média

| # | Problema | Situação |
|---|---|---|
| M1 | No painel, quatro dos seis indicadores não eram clicáveis: "Começam em até N dias", "Terminam em até N dias", "Contratantes" e "Executoras". | Corrigido: cada um leva à lista que o detalha na própria página. |
| M2 | Quatro processos SEI compartilhados por várias licenças, todas legadas. Exemplo: 990084141/2024 tem 6 licenças. | Pode ser legítimo (várias licenças num processo). Fica para revisão da fiscalização. |
| M3 | Dois trechos sem bairro: 052/2024 (Praia Vermelha) e 002/2023 (R. da Conceição, Centro). Eles ficam em "Sem bairro" nas listas e no agrupamento. | Correção manual pela edição da licença. |
| M4 | A proteção contra senhas vazadas do Supabase Auth está desligada. | Ação no painel do Supabase (Authentication › Policies). Não é feita por código. |

### Baixa

| # | Problema | Situação |
|---|---|---|
| B1 | A tabela `licencas_decisao_backup` continua no banco, com RLS e sem política, ou seja, sem acesso para ninguém. | Avaliar se o backup ainda é necessário. Não foi apagada. |
| B2 | Há 16 índices nunca usados, segundo o advisor de desempenho. | Base pequena: o custo é desprezível. Não mexi. |
| B3 | O lint tem 7 avisos de dependências de hooks. | Já existiam. Não bloqueiam. |

## 2. Inconsistências corrigidas

- C1: exclusão direta de empresa pelo gestor (migração e teste de banco).
- A1: trilha de correções em lote visível ao administrador.
- M1: indicadores do painel acionáveis.

## 3. Funcionalidades aprimoradas

- Administração › Manutenção: histórico das últimas 50 correções em lote, com data, autor, o que mudou e o motivo, e link para a licença.
- Painel: os indicadores levam às listas correspondentes.

## 4. Interface

Mudanças pequenas e funcionais, sem reformulação visual. O painel já tinha passado por uma redução de indicadores a pedido do usuário. Não reintroduzi indicadores que o prompt lista, como vigentes, encerradas, emergenciais, empresas ativas e distribuição por bairro, porque isso desfaria a decisão anterior. A distribuição por bairro já existe no portal público.

## 5. Alterações no banco de dados

Migração `20261112120000_empresas_exclusao_so_administrador.sql`:

```sql
drop policy if exists empresas_excluir on public.empresas;
revoke delete, truncate on public.empresas from anon, authenticated;
```

- Não altera nenhum dado nem a estrutura das tabelas.
- `admin_excluir_empresa` continua funcionando, porque é `SECURITY DEFINER` e pertence ao dono da tabela, sem RLS forçado. Isso foi conferido em produção.
- Reversão no próprio arquivo: recriar a política `empresas_excluir` e devolver o `grant delete`.
- **Ainda não aplicada em produção.** Depende de autorização.

## 6. Alterações nas permissões

- Gestor: perde a exclusão direta de empresa pela API. Pela tela, ele nunca teve essa ação, porque a exclusão é exclusiva do administrador.
- Nenhuma outra permissão mudou.

Verificações sem mudança:
- As 12 funções `admin_*` conferem `is_administrador()`.
- As funções do painel e de documentos conferem `is_gestor()`.
- As 5 funções públicas (consulta, mapa, GeoJSON, licença pública e verificação de documento) são públicas de propósito.
- A tela de Administração barra quem não é administrador, e o banco confere de novo.
- O papel `anon` só lê os catálogos `tipos_documento` e `tipos_intervencao`.

## 7. Testes executados

| Suíte | Resultado |
|---|---|
| Regras do banco (`scripts/test-db.sh`, 36 arquivos) | Todos passaram com a migração. Sem ela, o `23_excluir_empresa.sql` falha no caso novo. |
| Unidade (Vitest) | 258 passaram (2 novos: resumo de correção). |
| Tela (Playwright) | 130 passaram (2 novos: histórico de correções e indicadores clicáveis). |
| TypeScript e lint | Sem erros. Os 7 avisos já existiam. |

## 8. Pendências

1. **Aplicar a migração** em produção, depois da sua autorização.
2. **Conferir no SEI as licenças com datas incoerentes.** Os casos mais evidentes, com início um ano depois da validade:

   | Licença | Início previsto | Fim previsto | Validade |
   |---|---|---|---|
   | 099/2025 | 15/09/2026 | 14/10/2026 | 03/09/2025 |
   | 101/2025 | 02/09/2026 | 01/11/2026 | 14/09/2025 |
   | 111/2025 | 26/01/2026 | 25/02/2026 | 22/10/2025 |
   | 132/2025 | 28/01/2026 | 27/02/2026 | 12/12/2025 |
   | 098/2025 | 29/10/2025 | 28/11/2025 | 31/08/2025 |

   As outras 9 têm fim previsto depois da validade por dias ou semanas: 089/2025, 022/2023, 100/2025, 103/2025, 105/2025, 110/2025, 121/2025, 131/2025 e 158/2025. Pode ser obra que passou do prazo, e não erro. Nenhuma foi alterada.
3. Revisar os processos SEI compartilhados (M2) e os 2 trechos sem bairro (M3).
4. Ligar a proteção contra senhas vazadas no Supabase (M4).
5. Decidir o destino de `licencas_decisao_backup` (B1).

## 9. Pontos do prompt que não se aplicam ou dependem de decisão

- **Modalidade emergencial**: não existe no sistema. O prompt pede para preservá-la, mas criá-la seria uma regra de negócio nova, que precisa de base normativa. Não implementei.
- **Exportação XLSX**: o sistema exporta CSV, que o Excel abre. XLSX exigiria uma biblioteca nova. Recomendo só se houver demanda concreta.
- **Itens não auditados a fundo nesta rodada**:
  - campo a campo dos formulários de licença e de empresa (item 4.1);
  - experiência do painel em tablet;
  - conferência das exportações contra os filtros aplicados (item 9).

  Os testes de tela existentes cobrem os fluxos, mas não substituem essa revisão.

## 10. Recomendações

- Em toda tabela com exclusão sensível, proteger com gatilho ou retirar o `DELETE` do papel `authenticated`, como já é feito nas licenças. A exclusão passa a ser só pelas funções do administrador.
- Criar uma checagem periódica, só leitura, de integridade de datas: validade antes do fim previsto, ano do início diferente do ano do número da licença. O resultado iria para "Licenças para revisar" na Administração.
