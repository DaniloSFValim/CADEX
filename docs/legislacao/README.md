# Legislação de referência do CADEX

Arquivos originais, guardados para consulta.

| Arquivo | Norma | Observação |
|---|---|---|
| `lei-3988-2025-niteroi.pdf` | Lei Ordinária nº 3.988, de 09/04/2025 | Diretrizes para a utilização de vias, subsolo e espaço aéreo por concessionárias e entes autorizados. Texto digital. |
| `diario-oficial-11-09-2026-resolucao-cadex.pdf` | Resolução Conjunta SECONSER/SEOP nº 001, de 09/09/2026 (DO de 11/09/2026, p. 46-47) | Cadastro de Executores (CADEX) e protocolos de intervenção. Página escaneada, sem texto pesquisável. |

## Artigos da Resolução usados nos documentos e na licença de obra

- **Art. 2º, VII:** trecho é a extensão contínua de via, logradouro ou faixa de servidão, delimitada por coordenadas de início e fim. Por isso cada trecho tem início e fim.
- **Art. 11:** é vedado iniciar a obra de infraestrutura sem licença para execução, expedida individualmente por trecho.
- **Art. 12:** o pedido é instruído com planta de locação, cronograma físico e ART ou RRT específicos da intervenção.
- **Art. 13:** a SECONSER decide em 20 dias úteis. O parágrafo único diz que a validade da licença deferida corresponde ao prazo do cronograma aprovado.
- **Art. 14:** o canteiro de obra deve exibir placa ou QR Code com a razão social da empresa executora, o número da licença, o escopo e o prazo previsto.
- **Art. 26:** concluída a obra, a empresa protocola na SECONSER o projeto como efetivamente construído (As Built).

## Lei nº 3.988/2025: obrigações usadas nas condições da licença

- **Art. 6º, I:** obter as autorizações antes do início das intervenções.
- **Art. 6º, IV:** sinalizar adequadamente o local das obras.
- **Art. 6º, VII:** recompor a via pública nas condições anteriores à intervenção.
- **Art. 6º, IX:** reparar danos ao pavimento, às calçadas e aos demais elementos urbanos.
- **Art. 6º, XIV:** informar previamente a comunidade afetada sobre início, duração e impactos.
- **Art. 6º, XXIV:** concluir as intervenções nos prazos fixados na autorização.
- **Art. 10:** a execução depende de prévia autorização da SECONSER.
- **Art. 13:** penalidades (advertência, multa, embargo); recurso em 15 dias.

## Ponto em aberto

A regra interna do CADEX fixa validade de 30 dias a partir do início para todas as licenças. A Resolução, no art. 13, parágrafo único, diz que a validade corresponde ao prazo do cronograma aprovado. Antes de imprimir "Válida até" na licença, essa divergência precisa ser decidida.

**Decisão do responsável pelo produto:** a licença vale 30 dias fixos a partir do início. A regra está implementada no banco (`licencas_validade`).
**Conflito não resolvido:** isso contraria o art. 13, parágrafo único, da Resolução (validade = prazo do cronograma aprovado). Antes de publicar a licença com "Válida até", é preciso uma base normativa que autorize os 30 dias (ato da SECONSER ou decreto), ou revisar a regra.

## Emergência × art. 20 da Resolução (verificado no código)

- **Prazo:** o art. 20 manda registrar em até **24 horas após a conclusão** do atendimento. O CADEX cobra **72 horas a partir do início** (`PRAZO_EMERGENCIA_HORAS`, `src/lib/comunicacoes.ts`, e a função do banco na migração `20261128120000`). São regras diferentes, e a do CADEX não é a da Resolução.
- **Protocolo do CISP:** o art. 20 exige o número do protocolo no registro. No CADEX o campo é opcional e nenhuma validação o exige.
- **Imagens e escopo executado:** o art. 20 exige imagens e escopo do serviço executado após a conclusão. O CADEX não tem campo de conclusão nem de imagens para a emergência.
- **Ligação ao CISP antes de agir (art. 19):** a tela já orienta isso ("ligar para o 153 antes de agir"). Está de acordo.
