# Matriz de conformidade

**Norma de referência:** Resolução Conjunta SECONSER/SEOP nº 001, de 09 de
setembro de 2026 — Município de Niterói. Fundamento: art. 76, II, da Lei
Orgânica e Lei Municipal nº 3.988/2025.

Conferência feita contra o texto integral. Legenda:
✅ implementado e testado · 🟡 implementado, sem teste automatizado ·
⬜ não implementado · ⚖️ decisão administrativa pendente

---

## Capítulo I — Finalidade e definições

| Dispositivo | Comando normativo | Implementação | Teste |
|---|---|---|---|
| Art. 1º | Âmbito: vias, subsolo e espaço aéreo de Niterói | Centro do mapa e seed em Niterói; escopo do modelo | 🟡 |
| Art. 2º, I | Empresa cadastrada apta a requerer licença e registrar autodeclaração | `cadex.is_company_active` | ✅ |
| Art. 2º, II | Empresa executora — responsabilidade técnica e operacional | `interventions.executor_id` | ✅ |
| Art. 2º, III | Concessionária contratante — responde solidariamente | `interventions.concessionaire_id`, coluna distinta | ✅ |
| Art. 2º, IV | CADEX como instrumento de habilitação | Módulo `companies` + situação cadastral | ✅ |
| Art. 2º, V | Sistema eletrônico oficial | Este sistema | — |
| Art. 2º, VI | CISP / canal 153 | `cisp_protocols` | ✅ |
| Art. 2º, VII | **Trecho delimitado por coordenadas de início e de fim** | `segment_start` / `segment_end` como `geometry(Point,4326)` + trigger | ✅ |
| Art. 2º, VIII | Subcontratada em qualquer grau | `company_relationships` + CTE recursiva sem limite | ✅ |

## Capítulo II — CADEX

| Dispositivo | Comando normativo | Implementação | Teste |
|---|---|---|---|
| Art. 3º, caput | Inscrição prévia e ativa é condição de atuação | Trigger `check_intervention_parties` | ✅ |
| Art. 3º, § 1º | Alcança subcontratada em qualquer grau; vedada qualquer parcela | Mesmo trigger, para `subcontractor_id` | ✅ |
| Art. 3º, § 2º | Equiparação a obra sem autorização — inciso XXI | `sanction_reference` no checklist | 🟡 |
| Art. 4º | Só a cadastrada requer licença e registra autodeclarações | Trigger + policies | ✅ |
| Art. 5º | Inscrição não autoriza, por si, iniciar escavação | `start_intervention` exige licença | ✅ |
| Art. 6º, I, "a"–"h" | Documentação jurídica e fiscal | 8 `document_types` com `legal_basis` | ✅ |
| Art. 6º, II, "a"–"c" | Documentação técnica | 3 `document_types`; equipamentos e contingente **unificados** | ✅ |
| Art. 6º, III | Declaração de regularidade, estritamente declaratória | `DECL_REGULADOR`, sem validade a controlar | ✅ |
| Art. 6º, IV | Mapa em arquivo digital vetorial georreferenciado | `MAPA_INFRA` + bucket | 🟡 |
| Art. 6º, V | Contrato de compartilhamento + adimplência só de Niterói | 2 tipos com o mesmo fundamento | 🟡 |
| Art. 7º, caput | Decisão em 15 dias úteis | `analysis_due_date` sobre `holidays` | ✅ |
| Art. 7º, § 1º | Validade de 12 meses, renovável | `approve_company` | ✅ |
| Art. 7º, § 2º | **Publicação da relação de CADEX ativo** | View `public_companies` + portal | ✅ |
| Art. 8º, caput | Notificação e saneamento em 30 dias | `refresh_company_status` | ✅ |
| Art. 8º, § 1º | Sem saneamento, passa a inapta | idem | ✅ |
| Art. 8º, § 2º | Inapta não requer licença nem registra autodeclaração | `is_company_active` | ✅ |
| Art. 8º, § 3º | **Habilitação restabelecida após saneamento** | `cadex.reinstate_company` | ✅ |

## Capítulo III — Classificação e protocolos

| Dispositivo | Comando normativo | Implementação | Teste |
|---|---|---|---|
| Art. 9º | Três categorias, protocolos distintos | Três tabelas e três enums de status | ✅ |
| Art. 10 | Rol das obras de infraestrutura | 5 `intervention_types` com `requires_license` | ✅ |
| Art. 11 | Vedado iniciar sem licença, por trecho ou projeto | `start_intervention` | ✅ |
| Art. 12 | Planta de locação, cronograma físico, ART/RRT específica | `license_documents.kind` | 🟡 |
| Art. 13, caput | Decisão em 20 dias úteis | Trigger no protocolo | ✅ |
| Art. 13, pú | Validade = prazo do cronograma aprovado | `approve_license(p_valid_until)` | ✅ |
| Art. 14 | **Placa ou QR Code: razão social, nº da licença, escopo, encerramento previsto** | `PublicVerify` + `public_interventions` | ✅ |
| Art. 15 | Manutenção rotineira — não modifica a estrutura da via | 6 `intervention_types`; rol exemplificativo | ✅ |
| Art. 16 | Independe de licença prévia | `requires_license = false` | ✅ |
| Art. 17 | **Registro do cronograma georreferenciado e do roteiro antes do deslocamento** | Trigger `check_declaration_order` + `declaration_routes` | ✅ |
| Art. 17, pú | Sanção — inciso IV | `sanction_reference` | 🟡 |
| Art. 18, I e II | Hipóteses de emergência | `emergencies.risk_category` com `check` | ✅ |
| Art. 19, caput | **Acionamento do 153 no momento do deslocamento** | Trigger `check_emergency_dispatch` | ✅ |
| Art. 19, § 1º | **Conteúdo da comunicação: CADEX, endereço, risco, tipo e placa do veículo, nome/identidade/telefone do responsável** | Colunas + trigger + formulário do CISP | ✅ |
| Art. 19, § 2º | Protocolo portado e exibido de imediato | Item de checklist `PROTOCOLO_CISP` | 🟡 |
| Art. 20, caput | **24 horas contadas da CONCLUSÃO do atendimento** | `set_emergency_deadline` sobre `concluded_at` | ✅ |
| Art. 20, pú | Sanção (inciso III) e desqualificação da falsa emergência | `cadex.disqualify_emergency` + status `nao_enquadrada` | ✅ |

## Capítulo IV — Identificação e controle

| Dispositivo | Comando normativo | Implementação | Teste |
|---|---|---|---|
| Art. 21 | Identificação visual permanente de veículo e maquinário | `vehicles` | 🟡 |
| Art. 21, pú | Nome da empresa em ambas as laterais; concessionária na traseira | Item de checklist com o texto do dispositivo | ✅ (fundamento) |
| Art. 22 | Vedada intervenção sem identificação civil e corporativa | Item `EQUIPE_IDENT` | 🟡 |
| Art. 23, I–V | Crachá: foto, nome e documento, função, empresa, validade | `team_members` + `verify_badge` | ✅ |
| Art. 24, caput e § 1º | Uniforme identificado e EPIs | Itens `UNIFORMES`, `EPIS` | 🟡 |
| Art. 24, § 2º | **Faixas retrorrefletivas em altura, via de tráfego ou espaço confinado** | Item `FAIXAS_RETRORREFLETIVAS` | ✅ |
| Art. 25, caput | **OS subscrita por responsável técnico ou preposto designado** | `signed_by_*` + trigger | ✅ |
| Art. 25, § 1º | Conteúdo da OS, com o CADEX da subcontratada | Colunas + view `work_orders_full` (número derivado) | ✅ |
| Art. 25, § 2º | Emergência: OS digital, endereço dispensado | Trigger `check_work_order_address` | ✅ |

## Capítulo V — Transitórias e finais

| Dispositivo | Comando normativo | Implementação | Teste |
|---|---|---|---|
| Art. 26 | As Built vetorial georreferenciado, com profundidade ou altura | `as_built` + `as_built_files` | 🟡 |
| Art. 27 | Protocolo em papel/e-mail até o sistema existir | Fora do software | — |
| Art. 28 | Agentes de apoio ao tráfego — Lei nº 4.038/2025 | Item `AGENTES_TRAFEGO` | ✅ (fundamento) |
| Art. 29, caput | 60 dias da publicação para protocolar inscrição | `transition.deadline` = 08/11/2026 + `transition_status()` | ✅ |
| Art. 29, pú | Capítulo IV é de cumprimento imediato | Nota em `transition_status()`; checklist sem carência | ✅ |
| Art. 30 | Casos omissos: SECONSER + SEOP | Comentário em `system_parameters` | — |
| Art. 31 | Vigência na publicação (09/09/2026) | `resolution.published_on` | ✅ |

---

## Divergência normativa corrigida nesta revisão

**Art. 20 — termo inicial do prazo de 24 horas.**

A implementação anterior contava o prazo a partir do **acionamento do
CISP**. O dispositivo é expresso em sentido diverso: *"Concluído o
atendimento, a empresa executora dispõe do prazo de 24 (vinte e quatro)
horas para registrar…"*. O prazo corre da **conclusão do atendimento**.

Num atendimento de 10 horas, a regra antiga esgotaria o prazo 10 horas
antes do devido e poderia gerar autuação indevida com base no inciso III
do Anexo Único da Lei nº 3.988/2025. Corrigido na migration 07, com teste
que fixa o comportamento (`04_resolucao_001_2026.sql`).

## Demais ajustes decorrentes da leitura

1. **Art. 2º, VII** — o trecho passou a exigir coordenadas de início e fim;
   antes era texto livre.
2. **Art. 6º, II, "c"** — "relação descritiva de equipamentos **e** do
   contingente de pessoal técnico" é um documento; havia dois tipos
   cadastrados, criando exigência sem previsão normativa.
3. **Art. 19, § 1º** — tipo e placa do veículo e identidade e telefone do
   responsável passaram a ser exigidos no registro do acionamento.
4. **Art. 19, caput** — não há deslocamento regular sem protocolo prévio,
   nem protocolo posterior ao deslocamento.
5. **Art. 20, pú** — criada a desqualificação da emergência que não se
   enquadre no art. 18, restrita à SECONSER e registrada em auditoria.
6. **Art. 25** — a subscrição da OS por responsável técnico ou preposto
   passou a ser condição de validade, não campo opcional.
7. **Art. 24, § 2º** — incluído item de checklist para faixas
   retrorrefletivas.
8. **Art. 8º, § 3º** — criado ato explícito de restabelecimento, para que
   conste da trilha do processo e não seja mero efeito de recálculo.
9. **Art. 1º** — o município é **Niterói**; coordenadas e dados de
   demonstração corrigidos (estavam no Rio de Janeiro).

---

## Decisões do art. 30 já tomadas

Registradas na tabela `normative_decisions`, auditáveis e reversíveis por
ato da mesma autoridade. Cada uma tem teste que trava o comportamento
(`05_decisoes_art30.sql`).

| # | Questão | Decisão | Efeito no sistema |
|---|---|---|---|
| 1 | Os prazos dos arts. 7º e 13 suspendem-se durante a diligência? | **Não.** Correm continuamente do protocolo. | `analysis_due_date` é calculada uma vez e congelada por trigger; diligência não a altera |
| 2 | A inaptidão suspende obra já licenciada? | **Não.** A licença deferida permanece e a obra prossegue. | O bloqueio incide na criação e alteração de vínculos, não na execução. A situação cadastral corrente da executora passou a ser publicada |
| 3 | Substituição de poste é obra ou manutenção? | **Manutenção rotineira**, salvo escavação ou nova fundação. | Novo tipo `SUBST_POSTE` sem licença; `requires_excavation = true` impede o registro como manutenção |

### Ressalva técnica registrada na decisão 3

O critério legal do art. 15 é a atividade **não modificar a estrutura da
via**, e o art. 10 classifica como obra a escavação a céu aberto e a
implantação de postes. Enquadrar toda substituição como manutenção, sem
condição alguma, abriria via de evasão: bastaria rotular de
"substituição" uma implantação que exige nova cava e nova fundação, e a
licença do art. 11 seria dispensada por nomenclatura.

A decisão foi implementada com um único condicionamento, extraído do
próprio art. 10 — a substituição é manutenção **enquanto não houver
escavação ou nova fundação**. Para afastá-lo, basta remover o trigger
`cadex.check_maintenance_scope` e registrar nova decisão na tabela.

### Contrapartida da decisão 2

A obra licenciada prossegue, mas o fiscal em campo e o cidadão passam a
enxergar que a executora está sem inscrição ativa
(`executor_cadex_status` e `executor_cadex_active` em
`public_interventions`). A informação é de publicação obrigatória pelo
art. 7º, § 2º; não suspender a obra não é o mesmo que esconder o fato.

---

## ⚖️ Pendências de definição administrativa

Sete pontos remanescentes. Não implementados por inferência: dependem de
ato da SECONSER/SEOP (art. 30), como os três já resolvidos acima.

1. **Termo inicial dos 30 dias do art. 8º.** O texto conta da
   *notificação*. O sistema notifica na detecção automática, de modo que
   os prazos coincidem — mas se a notificação exigir ato formal diverso,
   o termo inicial muda.
2. **Renovação (art. 7º, § 1º).** Se os novos 12 meses correm da data do
   novo deferimento ou emendam ao fim da vigência anterior.
3. **Art. 6º, IV e V — exigibilidade condicional.** Empresa sem
   infraestrutura própria ou sem contrato de compartilhamento não tem o
   que juntar. Estão marcados como não obrigatórios; se a SECONSER exigir
   declaração negativa, é ajuste de catálogo.
4. **Demais casos de fronteira entre os arts. 10 e 15.** A substituição de
   poste está decidida (ver acima). Outros casos — recomposição de
   pavimento sobre vala de terceiro, por exemplo — seguem sem
   enquadramento.
5. **Quem abre a emergência no sistema.** O art. 19 impõe o acionamento
   pela empresa; o art. 20 impõe o registro a ela. Hoje o CISP registra o
   acionamento e a executora complementa. Se a executora deve poder abrir
   diretamente, é decisão de fluxo.
6. **Anexo Único da Lei nº 3.988/2025.** A Resolução remete aos incisos
   III, IV e XXI. O Anexo não integra o texto fornecido: as referências
   estão gravadas como citação, sem que o sistema calcule penalidade.
7. **Art. 14 — placa física.** O dispositivo admite "placa **ou** QR
   Code". O sistema entrega o QR Code e a página pública; a especificação
   gráfica da placa física, se exigida, não está definida.
