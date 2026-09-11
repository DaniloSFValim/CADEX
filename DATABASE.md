# Banco de dados

PostgreSQL 16 + PostGIS 3. Migrations em `supabase/migrations/`, aplicadas
em ordem lexicográfica.

| Migration | Conteúdo |
|---|---|
| `00_extensions_and_core` | extensões, enums, utilitários, parâmetros, feriados, perfis, papéis, auditoria |
| `01_cadex` | empresas, qualificações, documentos, responsáveis, subcontratação, motor de situação cadastral |
| `02_interventions` | núcleo georreferenciado, licenças, autodeclarações, emergências, protocolos CISP |
| `03_field` | equipes, crachás, veículos, ordens de serviço, fiscalização, As Built, notificações |
| `04_rls_and_public` | RLS, grants, triggers de auditoria, views públicas, RPC de verificação |
| `05_deadline_engine` | prazos, varredura, indicadores, consulta espacial, catálogos, wrappers RPC |
| `06_storage` | buckets privados e políticas (só roda em projeto Supabase) |

## Entidades principais

**Habilitação** — `companies`, `qualifications`, `company_qualifications`,
`company_documents`, `document_types`, `company_representatives`,
`technical_responsibles`, `company_relationships`, `administrative_events`.

**Intervenções** — `interventions` (núcleo), `intervention_types`,
`licenses`, `license_documents`, `declarations`, `declaration_routes`,
`emergencies`, `emergency_photos`, `cisp_protocols`.

**Campo** — `teams`, `team_members`, `vehicles`, `work_orders`,
`intervention_assignments`, `inspections`, `inspection_items`,
`inspection_photos`, `inspection_checklist_items`.

**Territorial** — `as_built`, `as_built_files`, `infrastructure_assets`.

**Transversal** — `profiles`, `user_roles`, `notifications`, `audit_logs`,
`system_parameters`, `holidays`.

## Integridade que o banco garante sozinho

- CNPJ com dígito verificador correto (`check` + `cadex.is_valid_cnpj`).
- Placa de veículo única, normalizada (índice único sobre expressão).
- Uma única versão vigente por (empresa, tipo de documento) — índice único
  parcial.
- Ausência de ciclo na cadeia de subcontratação — trigger recursivo.
- Executora, subcontratada e concessionária com CADEX ativo — trigger.
- Deslocamento de equipe posterior ao registro da autodeclaração — trigger.
- OS não emergencial com endereço — trigger.
- `audit_logs` imutável — trigger que aborta UPDATE/DELETE.

## Funções de domínio (schema `cadex`)

| Função | Papel |
|---|---|
| `is_valid_cnpj` | validação real de CNPJ |
| `add_business_days`, `business_days_between` | dias úteis sobre `holidays` |
| `param_int` | leitura de parâmetro normativo |
| `has_role`, `has_any_role`, `is_staff`, `current_company_id` | RBAC para as policies (`security definer`, senão a RLS recursa) |
| `is_company_active` | habilitação (Regras 1, 6, 8) |
| `refresh_company_status` | situação cadastral derivada |
| `approve_company`, `approve_license` | deferimento com checagem de papel |
| `start_intervention` | Regra 2 |
| `regularize_emergency` | Regra 5 |
| `subcontracting_chain` | cadeia recursiva |
| `run_deadline_sweep` | varredura idempotente de prazos |
| `audit_row` | trilha genérica |

## Índices que importam

GiST em toda coluna geométrica (`interventions.geom`,
`declaration_routes.geom`, `inspections.location`, `as_built.geom`,
`infrastructure_assets.geom`); GIN trigram em `companies.legal_name` para
busca por nome; índices parciais em validade de documento e situação
cadastral.
