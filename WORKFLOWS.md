# Workflows

## 1. CADEX (habilitação)

```
RASCUNHO → PROTOCOLADO → EM ANÁLISE → ┬→ PENDENTE (diligência) ─┐
                                       │                         │
                                       └→ DEFERIDO/ATIVO ←───────┘
                                          ↓ (12 meses)
                                          PRÓXIMO DO VENCIMENTO → INAPTO
                          EM ANÁLISE → INDEFERIDO
```

- O protocolo calcula `analysis_due_date` em dias úteis sobre `holidays`.
- O deferimento gera número CADEX, `valid_from`/`valid_until` e exige que
  nenhum documento esteja pendente, rejeitado ou vencido.
- Documento vencido → PENDENTE + abertura de `remediation_due_date`.
  Decorrido o saneamento → INAPTO.
- PENDENTE aberto por diligência (sem pendência documental) só sai por
  decisão do analista: a varredura automática não o move.
- **A diligência não suspende o prazo de análise** (decisão art. 30 (1)):
  os 15 dias úteis correm continuamente do protocolo. O mesmo vale para os
  20 dias úteis da licença (art. 13).

## 2. Obra de infraestrutura

```
RASCUNHO → PROTOCOLADA → EM ANÁLISE → ┬→ EM DILIGÊNCIA
                                       ├→ DEFERIDA → EM EXECUÇÃO → CONCLUÍDA
                                       │      ↓ (fim da vigência)
                                       │   VENCIDA
                                       └→ INDEFERIDA
```

`cadex.start_intervention` recusa iniciar obra sem licença deferida e
vigente. Concluída a obra, abre-se o fluxo de As Built.

## 3. Manutenção rotineira

```
RASCUNHO → REGISTRADA → EQUIPE EM DESLOCAMENTO → EM EXECUÇÃO → ENCERRADA
```

O registro é condição do deslocamento: o banco recusa `dispatched_at` sem
`registered_at`, e recusa deslocamento anterior ao registro.

## 4. Emergência

```
ACIONADA (153 → protocolo CISP) → EM DESLOCAMENTO → EM ATENDIMENTO
   → AGUARDANDO REGULARIZAÇÃO → ┬→ REGULARIZADA
                                 └→ FORA DO PRAZO
```

O prazo corre do **acionamento**, não do registro. A regularização exige
protocolo CISP, descrição do serviço executado e ao menos uma imagem —
sem os três, a função recusa. A varredura marca `fora_do_prazo` e notifica.

## 5. As Built

```
OBRA CONCLUÍDA → SOLICITADO → ENVIADO → EM VALIDAÇÃO → ┬→ APROVADO → ARQUIVADO
                                                        └→ REPROVADO
```

Registra geometria executada, profundidade e altura, alimentando
`infrastructure_assets` como memória territorial.

## 6. Fiscalização

```
Fiscal no local → identifica (QR Code, busca ou GPS)
  → sistema apresenta empresa, CADEX, concessionária, licença, escopo, trecho
  → checklist (conforme / não conforme / não aplicável)
  → fotografias + GPS
  → gravação: inspections + inspection_items + inspection_photos
```

O resultado global e a marcação de irregularidade são **derivados** dos
itens por trigger — o fiscal não informa "conforme" por fora do checklist.
