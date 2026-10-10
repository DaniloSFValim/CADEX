# Notas de design do CADEX

Fonte da verdade visual do sistema inteiro (área pública e restrita). Quando o
código e este documento divergirem, o código é que muda. Os tokens ficam em
`src/index.css` (bloco `@theme`).

O CADEX segue a família visual do NETRANK RJ (`DaniloSFValim/rankingprovedoresrj`,
mesma autoria): fio escuro no topo dos indicadores, selo por situação, faixa
de marca branca.

## Assunto e públicos

Cadastro oficial da Prefeitura de Niterói. A pergunta central é "esta empresa
pode atuar em obras na via pública?". A situação da inscrição é o elemento de
destaque em todo registro.

- **Cidadão** (consulta pública, sem login): responder rápido e com confiança.
- **Empresa** (cadastro e documentos): saber o que falta e o que vence.
- **SECONSER e CISP** (área restrita): trabalhar em tabelas e fichas densas.

## Cores

Tokens em `src/index.css`:

- **Marca (petróleo, `marca-*`):** ações, navegação ativa, links, cabeçalhos de
  página. Base `marca-600` (#0b6572); `marca-700` (#0b5b68) também na cor
  do tema do navegador.
- **Tinta (grafite, `tinta-*`):** papel `tinta-50` (#f3f5f4), linhas
  `tinta-200`, texto `tinta-900`.
- **Situação:** `alta` (#1e7b4c) para apta e deferida, `atencao` (#8f5b00) para
  em análise e em saneamento, `baixa` (#b3372c) para inapta e vencida. Cores de
  situação só aparecem onde há uma situação.
- **Laranja:** só no logotipo oficial da Prefeitura. Não há acento laranja no
  sistema.

## Tipografia

- **Uma família: Public Sans** (variável, servida pelo próprio site), em todos
  os papéis: texto, títulos e números.
- **Números:** classe `tabular` em CNPJ, códigos, datas, nº de licença e
  contagens, para que as colunas alinhem.
- **Sem fonte monoespaçada.** Códigos ficam na Public Sans com `tabular`.
- **Escala:** título de página 30 px (36 px em telas largas); título de seção
  20 px; texto 14 px nas tabelas e 16 px no corpo público.
- **Linha de texto:** até cerca de 75 caracteres.

## Layout e superfícies

- **Cabeçalho:** faixa branca com linha fina embaixo. O logotipo oficial
  (`public/logo-prefeitura-seconser.png`) à esquerda, seguido de "CADEX" e
  "Cadastro de Executores". Menu com abas retas: a ativa em petróleo, as demais
  em grafite sobre fundo claro.
- **Cartão (`.cartao`):** fundo branco, linha fina, cantos `rounded-xl`, sem
  sombra.
- **Títulos de seção** ficam fora do cartão, em 20 px.
- **Indicadores em destaque (área restrita):** componente `Kpi`, com traço
  grosso no topo.
- **Selo da situação:** filete de 4 px à esquerda, na cor da situação, em cada
  registro (`BARRA` em `Situacao.tsx`).
- **Sombras:** só onde a superfície flutua de verdade (alerta sobre o mapa) e
  na pré-visualização impressa de fichas e placas, que imita papel.
- **Herói da consulta pública:** título direto e a busca logo abaixo. Sem painel
  de números e sem frase com contagens na abertura.
- **Rodapé:** branco, em três colunas, com quem responde pelo CADEX e os contatos.

## Textos

- **Nome do sistema:** "Cadastro de Executores (CADEX)". O termo "executora"
  aparece em títulos da consulta, como "Consultar empresa executora".
- **Separadores:** não juntar informações com "·". Use vírgula, ponto ou linha
  nova.
- **Caixa alta:** nenhum rótulo em caixa alta espaçada. Os termos oficiais da
  Resolução (APTA, INAPTA, EM ANÁLISE…) ficam em maiúsculas por serem a
  designação oficial e aparecem assim na ficha impressa e na planilha. Na tela,
  seguem em caixa normal ("Apta").
- **Trilha de página:** texto simples, sem filete nem ornamento.
- **Botões:** verbo no botão ("Imprimir ficha", "Exportar planilha"). Sem seta
  "→" em link ou botão.
- **Estado vazio:** diz o que fazer, em uma frase.
- **Erros:** dizem o que aconteceu e como corrigir, sem pedir desculpas.

## Qualidade mínima

- Responsivo até 360 px, sem rolagem horizontal da página.
- Foco visível por teclado (`:focus-visible`, contorno petróleo).
- Movimento reduzido respeitado (`prefers-reduced-motion`).
- Contraste de texto de pelo menos 4.5:1 sobre o fundo.
