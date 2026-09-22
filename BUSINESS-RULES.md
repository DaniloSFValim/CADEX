# Regras de negócio

Cada regra abaixo é aplicada **no banco**. A coluna "espelho no cliente"
indica onde há validação adicional para feedback imediato — que nunca
substitui a barreira do banco.

| Regra | Dispositivo | Onde é aplicada | Espelho no cliente | Teste |
|---|---|---|---|---|
| R1 — Sem CADEX ativo a empresa não executa nem é contratada | Art. 3º, caput | trigger `check_intervention_parties` | `isCadexActive` | `02` |
| R2 — Obra exige licença prévia deferida e vigente | Arts. 5º e 11 | `cadex.start_intervention` | `canStartWork` | `02` |
| R3 — Manutenção exige registro anterior ao deslocamento | Art. 17 | trigger `check_declaration_order` | — | `02` |
| R4 — Emergência exige acionamento do 153 no deslocamento | Art. 19, caput | trigger `check_emergency_dispatch` | — | `04` |
| R4b — Conteúdo mínimo da comunicação ao CISP | Art. 19, § 1º | mesmo trigger | validação no formulário | `04` |
| R5 — 24 horas contadas da **conclusão** do atendimento | Art. 20, caput | `set_emergency_deadline` | `isEmergencyLate` | `02`, `04` |
| R5b — Emergência que não se enquadra é desqualificada | Art. 20, pú | `cadex.disqualify_emergency` | — | `04` |
| R6 — Subcontratada em qualquer grau precisa de CADEX ativo | Art. 3º, § 1º | mesmo trigger de R1 | `isCadexActive` | `02` |
| R7 — Verificação de autenticidade em campo | Arts. 7º, § 2º, 14 e 19, § 2º | `verify_public_token`, `verify_badge` | — | `02`, `03` |
| R8 — Inapta não requer licença nem registra autodeclaração | Art. 8º, § 2º | `is_company_active` + policies | — | `01`, `02` |
| R8b — Habilitação restabelecida após saneamento | Art. 8º, § 3º | `cadex.reinstate_company` | — | `04` |
| R9 — CNPJ válido | `check` + `is_valid_cnpj` | `isValidCnpj` | `01`, unidade |
| R10 — Deferimento só com documentação regular (art. 6º) | `approve_company` | — | `01` |
| R11 — Deferimento restrito a admin/gestor | checagem de papel na função | rota + UI | `01`, `02` |
| R12 — Documento vencido derruba a empresa para PENDENTE | `refresh_company_status` | `documentHealth` | `01` |
| R13 — Saneamento decorrido leva a INAPTO | `refresh_company_status` | — | `01` |
| R14 — Validade de 12 meses (art. 7º, § 1º) | `approve_company` | — | `01` |
| R15 — Subcontratação em qualquer grau (art. 2º, VIII), sem ciclo | CTE recursiva + trigger | — | `01` |
| R16 — Só a OS de emergência dispensa endereço (art. 25, § 2º) | trigger `check_work_order_address` | — | `02` |
| R16b — OS subscrita por RT ou preposto (art. 25) | trigger `check_work_order_signature` | — | `04` |
| R16c — Trecho delimitado por coordenadas (art. 2º, VII) | trigger `check_segment_coordinates` | — | `04` |
| R17 — Irregularidade derivada do checklist | trigger `sync_inspection_result` | — | — |
| R18 — Fiscal não registra em nome de terceiro | policy de insert | — | `03` |
| R19 — Empresa não vê dados de outra empresa | policies por `company_id` | — | `03` |
| R20 — Empresa não escala privilégio | policy de `user_roles` | — | `03` |
| R21 — Auditoria imutável | trigger `block_mutation` | — | `01` |
| R22 — Camada pública sem dado pessoal | views `public_*` | — | `02` |
| R23 — `anon` sem acesso a tabela | grants restritos | — | `03` |
| R24 — Prazos de 15 e 20 dias úteis (arts. 7º e 13) | `add_business_days` | — | `01`, `04` |
| R25 — Varredura de prazos idempotente | `dedupe_key` único | — | `02` |
| R26 — Pedido de licença instruído com planta de locação, cronograma físico e ART/RRT específica | Art. 12 | trigger `check_license_instruction` | etapa 5 do formulário | `06` |
| R27 — Deferir, indeferir, numerar e fixar vigência são atos da SECONSER | Art. 13 | trigger `enforce_license_authority` | — | `06` |
| R28 — Número de protocolo e prazo de análise são atribuídos pelo sistema | Art. 13 | `set_license_analysis_due` | — | `06` |
| R29 — Horário do registro da autodeclaração carimbado pelo servidor | Art. 17 | `check_declaration_order` | — | `06` |
| R30 — Conclusão do atendimento não se lança no futuro nem antes do deslocamento | Art. 20 | trigger `check_emergency_timeline` | — | `06` |
| R31 — Regularização só pela função própria, que decide se houve atraso | Art. 20 | trigger `enforce_emergency_authority` | — | `06` |
| R32 — A executora pode nomear contratante e subcontratada que a RLS lhe esconde | Art. 11 | `is_company_active` como `security definer` | resolução por CNPJ na etapa 1 | `06` |

## Decisões do art. 30 aplicadas como regra

| Regra | Decisão | Onde é aplicada | Teste |
|---|---|---|---|
| R26 — O prazo de análise não se suspende por diligência | art. 30 (1) | trigger `freeze_analysis_due_date` em `companies` e `licenses` | `05` |
| R27 — Inaptidão superveniente não suspende obra licenciada | art. 30 (2) | `start_intervention` verifica a licença, não a situação cadastral | `05` |
| R28 — A situação cadastral corrente da executora é publicada | art. 7º, § 2º c/c art. 30 (2) | `public_interventions.executor_cadex_active` | `05` |
| R29 — Substituição de poste é manutenção rotineira | art. 30 (3) | tipo `SUBST_POSTE`, sem licença | `05` |
| R30 — Escavação ou nova fundação não é manutenção | art. 10 c/c art. 30 (3) | trigger `check_maintenance_scope` | `05` |

As decisões ficam em `normative_decisions`, com questão, decisão,
fundamento e efeito concreto no sistema. Alterá-las é ato administrativo
registrado e auditado, não edição de código.

## Sanções

A Resolução remete o descumprimento aos incisos III (art. 20, pú), IV
(art. 17, pú) e XXI (art. 3º, § 2º) do Anexo Único da Lei Municipal nº
3.988/2025. O Anexo não integra o texto da Resolução: o sistema **grava a
referência** (`sanction_reference` em `system_parameters` e em
`inspection_checklist_items`) e **não calcula penalidade**. Enquadrar e
dosar a sanção continua sendo ato da autoridade.

## Regras ainda não modeladas

Ver "Pendências de definição administrativa" em `COMPLIANCE-MATRIX.md`:
nove pontos que dependem de ato da SECONSER/SEOP (art. 30) e **não**
foram implementados por inferência.
