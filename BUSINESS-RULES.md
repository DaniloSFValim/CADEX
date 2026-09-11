# Regras de negócio

Cada regra abaixo é aplicada **no banco**. A coluna "espelho no cliente"
indica onde há validação adicional para feedback imediato — que nunca
substitui a barreira do banco.

| Regra | Onde é aplicada | Espelho no cliente | Teste |
|---|---|---|---|
| R1 — Sem CADEX ativo a empresa não executa nem é contratada | trigger `check_intervention_parties` | `isCadexActive` | `02` |
| R2 — Obra exige licença prévia deferida e vigente | `cadex.start_intervention` | `canStartWork` | `02` |
| R3 — Manutenção exige autodeclaração anterior ao deslocamento | trigger `check_declaration_order` | — | `02` |
| R4 — Emergência segue protocolo CISP | FK obrigatória na regularização | — | `02` |
| R5 — Emergência regularizada dentro do prazo | `regularize_emergency` + varredura | `isEmergencyLate` | `02` |
| R6 — Subcontratada também precisa de CADEX ativo | mesmo trigger de R1 | `isCadexActive` | `02` |
| R7 — Fiscal verifica autenticidade | `verify_public_token`, `verify_badge` | — | `02`, `03` |
| R8 — CADEX inapto impede novo requerimento | `is_company_active` + policies | — | `01`, `02` |
| R9 — CNPJ válido | `check` + `is_valid_cnpj` | `isValidCnpj` | `01`, unidade |
| R10 — Deferimento só com documentação regular | `approve_company` | — | `01` |
| R11 — Deferimento restrito a admin/gestor | checagem de papel na função | rota + UI | `01`, `02` |
| R12 — Documento vencido derruba a empresa para PENDENTE | `refresh_company_status` | `documentHealth` | `01` |
| R13 — Saneamento decorrido leva a INAPTO | `refresh_company_status` | — | `01` |
| R14 — Validade de 12 meses a partir do deferimento | `approve_company` | — | `01` |
| R15 — Cadeia de subcontratação sem limite e sem ciclo | CTE recursiva + trigger | — | `01` |
| R16 — OS não emergencial exige endereço | trigger `check_work_order_address` | — | `02` |
| R17 — Irregularidade derivada do checklist | trigger `sync_inspection_result` | — | — |
| R18 — Fiscal não registra em nome de terceiro | policy de insert | — | `03` |
| R19 — Empresa não vê dados de outra empresa | policies por `company_id` | — | `03` |
| R20 — Empresa não escala privilégio | policy de `user_roles` | — | `03` |
| R21 — Auditoria imutável | trigger `block_mutation` | — | `01` |
| R22 — Camada pública sem dado pessoal | views `public_*` | — | `02` |
| R23 — `anon` sem acesso a tabela | grants restritos | — | `03` |
| R24 — Prazos em dias úteis com feriado configurável | `add_business_days` | — | `01` |
| R25 — Varredura de prazos idempotente | `dedupe_key` único | — | `02` |

## Regras ainda não modeladas

Ver a seção "Regras pendentes de definição administrativa" em
`COMPLIANCE-MATRIX.md`. Elas dependem do texto da Resolução ou de decisão
da SECONSER e **não** foram implementadas por inferência.
