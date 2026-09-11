# Matriz de conformidade

## Aviso metodológico

A matriz pedida na especificação tem a coluna **Artigo**. Ela está
**vazia em todas as linhas**, e isso é deliberado: o texto da Resolução
Conjunta SECONSER/SEOP nº 001/2026 não foi fornecido a esta sessão.

Preencher essa coluna por inferência produziria um documento que *parece*
auditável e não é — o pior resultado possível num sistema que existe para
sustentar decisão administrativa. Portanto, a rastreabilidade aqui é
**requisito → implementação → teste**, e a amarração ao artigo é a
próxima tarefa, a ser feita com o texto oficial à mão.

Legenda: ✅ implementado e testado · 🟡 implementado, sem teste automatizado ·
⬜ não implementado

---

## 1. CADEX — habilitação das empresas

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 1.1 | Cadastro de empresa com dados mínimos | _pendente_ | `companies` | CompaniesList / CompanyDetail | `companies` | ✅ |
| 1.2 | CNPJ válido (dígito verificador) | _pendente_ | `cadex.is_valid_cnpj` + `check` | validação no cliente | `companies.cnpj` | ✅ |
| 1.3 | Múltiplas qualificações por empresa | _pendente_ | N:N configurável | CompanyDetail | `company_qualifications` | 🟡 |
| 1.4 | Responsável legal e responsável técnico separados | _pendente_ | duas tabelas distintas | ⬜ | `company_representatives`, `technical_responsibles` | 🟡 |
| 1.5 | Documentos com validade e versionamento | _pendente_ | versão + `superseded_by` | CompanyDetail / CompanyPanel | `company_documents` | ✅ |
| 1.6 | Workflow rascunho→protocolado→análise→pendência→decisão | _pendente_ | enum + triggers | CompanyDetail | `cadex_status` | ✅ |
| 1.7 | Validade de 12 meses calculada no deferimento | _pendente_ | `cadex.approve_company` | CompanyDetail | `companies.valid_until` | ✅ |
| 1.8 | Número CADEX gerado no deferimento | _pendente_ | sequência anual | CompanyDetail | `cadex_number_seq` | ✅ |
| 1.9 | Documento vencido detectado automaticamente | _pendente_ | `refresh_company_status` | CompanyPanel | `company_documents.status` | ✅ |
| 1.10 | Prazo de saneamento e passagem a INAPTA | _pendente_ | `remediation_due_date` | CompanyPanel | `companies` | ✅ |
| 1.11 | Deferimento bloqueado com documento pendente | _pendente_ | exceção em `approve_company` | CompanyDetail | — | ✅ |
| 1.12 | Deferimento restrito a admin/gestor | _pendente_ | checagem de papel na função | — | `user_roles` | ✅ |
| 1.13 | Renovação da inscrição | _pendente_ | reaproveita `approve_company` | ⬜ | — | 🟡 |

## 2. Subcontratação e concessionária

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 2.1 | Cadeia de subcontratação sem limite de profundidade | _pendente_ | grafo + CTE recursiva | ⬜ | `company_relationships` | ✅ |
| 2.2 | Proibição de ciclo na cadeia | _pendente_ | trigger recursivo | — | — | ✅ |
| 2.3 | Concessionária, executora e subcontratada como entidades distintas | _pendente_ | três colunas na intervenção | CispEmergency / PublicVerify | `interventions` | ✅ |
| 2.4 | Relações preservadas no histórico da intervenção | _pendente_ | `snapshot` jsonb congelado | PublicVerify | `interventions.snapshot` | ✅ |
| 2.5 | Subcontratada exige CADEX ativo | _pendente_ | trigger | — | — | ✅ |

## 3. Licenciamento de obra

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 3.1 | Obra não inicia sem licença deferida | _pendente_ | `cadex.start_intervention` | ⬜ | — | ✅ |
| 3.2 | Licença vencida impede execução | _pendente_ | idem + varredura | ⬜ | `licenses.valid_until` | ✅ |
| 3.3 | Prazo de análise em dias úteis | _pendente_ | trigger no protocolo | CompanyDetail | `analysis_due_date` | ✅ |
| 3.4 | Número de licença no deferimento | _pendente_ | `approve_license` | ⬜ | `license_number_seq` | ✅ |
| 3.5 | Formulário em 6 etapas | _pendente_ | ⬜ | ⬜ | tabelas prontas | ⬜ |
| 3.6 | Desenho de geometria no mapa e import de arquivo | _pendente_ | ⬜ | ⬜ | `interventions.geom` | ⬜ |
| 3.7 | Documentos da licença (planta, cronograma, ART) | _pendente_ | tabela + bucket | ⬜ | `license_documents` | 🟡 |
| 3.8 | PDF e QR Code da licença | _pendente_ | token e rota de verificação prontos; PDF ⬜ | PublicVerify | `public_token` | ✅ (token) |
| 3.9 | Placa digital pública da obra | _pendente_ | página de verificação | PublicVerify | `public_interventions` | ✅ |

## 4. Manutenção rotineira

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 4.1 | Workflow separado do licenciamento | _pendente_ | tabela e enum próprios | ⬜ | `declarations` | ✅ |
| 4.2 | Registro obrigatoriamente anterior ao deslocamento | _pendente_ | trigger | ⬜ | — | ✅ |
| 4.3 | Deslocamento retroativo rejeitado | _pendente_ | trigger | — | — | ✅ |
| 4.4 | Roteiro georreferenciado com sequência | _pendente_ | geometria por ponto do roteiro | ⬜ | `declaration_routes` | 🟡 |
| 4.5 | Numeração da autodeclaração | _pendente_ | sequência anual | ⬜ | — | ✅ |
| 4.6 | Mapa de manutenção com filtros | _pendente_ | mapa comum | PublicHome / AdminDashboard | — | 🟡 |

## 5. Emergências

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 5.1 | Workflow separado; sem licença nem autodeclaração | _pendente_ | tabela própria | CispEmergency | `emergencies` | ✅ |
| 5.2 | Protocolo CISP registrado | _pendente_ | tabela dedicada | CispEmergency | `cisp_protocols` | ✅ |
| 5.3 | Prazo de regularização contado do acionamento | _pendente_ | trigger | CispEmergency | `regularization_due_at` | ✅ |
| 5.4 | Regularização exige protocolo, escopo e imagens | _pendente_ | `regularize_emergency` | ⬜ | — | ✅ |
| 5.5 | Emergência fora do prazo sinalizada | _pendente_ | função + varredura | CispEmergency | `fora_do_prazo` | ✅ |
| 5.6 | Alerta automático de emergência não regularizada | _pendente_ | `run_deadline_sweep` | — | `notifications` | ✅ |
| 5.7 | Horários de deslocamento, chegada e conclusão | _pendente_ | colunas dedicadas | ⬜ | `emergencies` | 🟡 |

## 6. Campo: equipes, veículos, OS, fiscalização

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 6.1 | Cadastro de equipes e integrantes | _pendente_ | tabelas + RLS | ⬜ | `teams`, `team_members` | 🟡 |
| 6.2 | Crachá digital com token verificável | _pendente_ | `verify_badge` (restrita à fiscalização) | ⬜ | `badge_token` | ✅ |
| 6.3 | Cadastro de veículos com placa única | _pendente_ | índice único normalizado | FieldHome (busca) | `vehicles` | 🟡 |
| 6.4 | Ordem de serviço numerada | _pendente_ | sequência anual | ⬜ | `work_orders` | 🟡 |
| 6.5 | OS de emergência dispensa endereço prévio | _pendente_ | trigger condicional | — | — | ✅ |
| 6.6 | Checklist de fiscalização configurável | _pendente_ | catálogo + aplicabilidade por tipo | FieldInspection | `inspection_checklist_items` | 🟡 |
| 6.7 | Conforme / não conforme / não aplicável | _pendente_ | enum | FieldInspection | `inspection_result` | 🟡 |
| 6.8 | Irregularidade derivada do checklist | _pendente_ | trigger de sincronização | FieldInspection | `inspections.irregularity` | 🟡 |
| 6.9 | Foto e GPS na fiscalização | _pendente_ | upload + `geography(Point)` | FieldInspection | `inspection_photos` | 🟡 |
| 6.10 | Fiscal não registra em nome de terceiro | _pendente_ | policy de insert | — | — | ✅ |
| 6.11 | Consulta por QR Code | _pendente_ | rota `/campo/fiscalizacao/:token` | FieldInspection | `public_token` | ✅ |
| 6.12 | Leitura da câmera para o QR Code | _pendente_ | ⬜ (hoje: link e busca) | ⬜ | — | ⬜ |
| 6.13 | Intervenções próximas por GPS | _pendente_ | `interventions_near` (PostGIS) | FieldHome | índice GiST | ✅ |
| 6.14 | Relatório de fiscalização em PDF | _pendente_ | ⬜ | ⬜ | `report_path` | ⬜ |

## 7. GIS

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 7.1 | Ponto, linha e polígono reais | _pendente_ | `geometry(Geometry, 4326)` | MapView | PostGIS | ✅ |
| 7.2 | Consulta espacial por proximidade | _pendente_ | `ST_DWithin` + GiST | FieldHome | — | ✅ |
| 7.3 | Mapa interativo com camadas por tipo | _pendente_ | MapLibre + GeoJSON | PublicHome / AdminDashboard | — | 🟡 |
| 7.4 | Import GeoJSON / KML / KMZ / Shapefile | _pendente_ | ⬜ | ⬜ | buckets prontos | ⬜ |
| 7.5 | As Built com profundidade e altura | _pendente_ | colunas + geometria | ⬜ | `as_built` | 🟡 |
| 7.6 | Arquivo histórico da infraestrutura | _pendente_ | tabela | ⬜ | `infrastructure_assets` | 🟡 |

## 8. Prazos, notificações, auditoria

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 8.1 | Dias úteis com calendário configurável | _pendente_ | `add_business_days` + `holidays` | ⬜ | — | ✅ |
| 8.2 | Feriados fora do frontend | _pendente_ | tabela no banco | ⬜ | `holidays` | ✅ |
| 8.3 | Prazos como parâmetro, não constante | _pendente_ | `system_parameters` | ⬜ | — | ✅ |
| 8.4 | Varredura de prazos idempotente | _pendente_ | `run_deadline_sweep` + `dedupe_key` | — | `notifications` | ✅ |
| 8.5 | Notificação interna | _pendente_ | tabela + leitura na UI | CompanyPanel | `notifications` | ✅ |
| 8.6 | E-mail / WhatsApp / SMS | _pendente_ | ⬜ arquitetura pronta (`channels`), sem provedor | — | — | ⬜ |
| 8.7 | Auditoria de ações relevantes | _pendente_ | trigger genérico em 14 tabelas | ⬜ | `audit_logs` | ✅ |
| 8.8 | Auditoria não apagável | _pendente_ | trigger que bloqueia UPDATE/DELETE | — | — | ✅ |
| 8.9 | Auditoria restrita a admin/gestor | _pendente_ | policy | — | — | ✅ |

## 9. Público e LGPD

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 9.1 | Consulta sem login | _pendente_ | views públicas + RPC | PublicHome / PublicConsulta | `public_*` | ✅ |
| 9.2 | `anon` sem acesso a tabela alguma | _pendente_ | grants restritos | — | — | ✅ |
| 9.3 | Ausência de dado pessoal na camada pública | _pendente_ | views sem colunas sensíveis | — | — | ✅ |
| 9.4 | Verificação de autenticidade por token | _pendente_ | `verify_public_token` | PublicVerify | `public_token` | ✅ |
| 9.5 | Token opaco, não o UUID interno | _pendente_ | `gen_random_bytes(16)` | — | — | ✅ |
| 9.6 | Mapa público | _pendente_ | MapLibre sobre view pública | PublicHome | — | 🟡 |
| 9.7 | Dashboard público | _pendente_ | contadores da view | PublicHome | — | 🟡 |

## 10. Segurança e perfis

| # | Requisito | Artigo | Implementação | Tela | Banco | Teste |
|---|---|---|---|---|---|---|
| 10.1 | Sete perfis com papéis acumuláveis | _pendente_ | `user_roles` N:N | Layout | — | ✅ |
| 10.2 | RLS em todas as tabelas, `force` inclusive ao dono | _pendente_ | migration 04 | — | — | ✅ |
| 10.3 | Empresa isolada de outra empresa | _pendente_ | policies por `company_id` | — | — | ✅ |
| 10.4 | Empresa não escala privilégio | _pendente_ | policy de `user_roles` | — | — | ✅ |
| 10.5 | Buckets privados com política por caminho | _pendente_ | migration 06 | — | `storage.objects` | ⬜ ¹ |
| 10.6 | Limite de tamanho e tipo de upload | _pendente_ | bucket + validação no cliente | FieldInspection | — | 🟡 |
| 10.7 | Sem segredo no frontend | _pendente_ | só URL e `anon key` | — | — | ✅ |
| 10.8 | Autocadastro desabilitado | _pendente_ | `enable_signup = false` | — | `config.toml` | 🟡 |

¹ Não testável fora de um projeto Supabase: o schema `storage` não existe
em Postgres puro. A migration se autodesativa nesse caso.

---

## Regras pendentes de definição administrativa

Itens que **não** foram implementados por adivinhação. Cada um precisa do
texto oficial ou de decisão da SECONSER antes de virar código:

1. **Contagem dos prazos.** Dias úteis ou corridos em cada caso; se o
   prazo de análise suspende durante diligência e recomeça no saneamento,
   ou apenas pausa. Hoje: `analysis_due_date` é calculada uma vez no
   protocolo e não é recalculada após diligência.
2. **Efeito exato da inaptidão sobre intervenções em curso.** O sistema
   impede *novas* vinculações de empresa sem CADEX ativo. Se uma obra já
   licenciada deve ser suspensa quando a executora fica inapta — e por
   qual ato — não está definido.
3. **Critério de renovação.** Se a renovação reinicia os 12 meses na data
   do novo deferimento ou emenda ao fim da vigência anterior.
4. **Fronteira entre obra e manutenção rotineira.** O catálogo em
   `intervention_types` reflete os exemplos da especificação; casos de
   fronteira (ex.: substituição de poste) precisam de enquadramento.
5. **Quem pode registrar a emergência no sistema.** Hoje: CISP/SEOP e
   admin abrem; a executora complementa. Se a própria executora pode
   abrir sem passar pelo 153, não está definido.
6. **Prazo transitório de 60 dias.** O parâmetro existe
   (`transition.days`) mas não há regra ativa que o aplique — falta saber
   o marco inicial e o efeito do seu decurso.
7. **Quais dados podem constar da placa digital pública.** A implementação
   atual é conservadora: nenhum dado pessoal. Se a Resolução exige exibir
   o responsável técnico, é uma decisão de publicidade a ser fundamentada.
8. **Sanções e reincidência.** O sistema registra irregularidades e conta
   reincidentes; a consequência administrativa não está modelada.
