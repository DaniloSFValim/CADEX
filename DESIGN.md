# Notas de design do CADEX

O CADEX segue a mesma família visual do NETRANK RJ
(`DaniloSFValim/rankingprovedoresrj`, mesma autoria): as escolhas abaixo
vêm de lá e valem para as próximas mudanças.

- **Assunto:** cadastro oficial que diz se uma empresa pode executar obras
  nas vias públicas de Niterói. A pergunta central é "esta empresa pode
  atuar?"; a situação da inscrição é o elemento de destaque.
- **Cores (tokens em `tailwind.config.js`):** petróleo `marca` (#0e7482) para
  ação, navegação e links; grafite `tinta` para papel (#f3f5f4), linhas
  (#cdd4d8) e texto (#141d26); `alta` (#1e7b4c), `baixa` (#b3372c) e
  `atencao` (#8f5b00) só para situação. O laranja fica no logotipo oficial.
- **Tipografia:** Public Sans servida pelo próprio site; números tabulares
  em CNPJ, códigos, datas e contagens.
- **Abertura da consulta pública:** título direto ("Consultar empresa
  executora") e a busca logo abaixo; sem frase com contagens.
- **Superfícies:** `.cartao` (fundo branco, linha fina, sem sombra). Títulos
  de seção ficam fora do cartão, em 20 px.
- **Números em destaque (área restrita):** `Kpi` com traço grosso em cima.
- **Selo da situação:** filete de 4 px à esquerda, na cor da situação, em
  cada registro.
- **Cabeçalho:** fixo, branco, logotipo e nome à esquerda, menu em
  "pílulas" com o item ativo em petróleo claro. Rodapé branco em três
  colunas.
- **Evitar:** rótulos em maiúsculas espaçadas, textos emendados com "·",
  sombras, fonte monoespaçada para códigos. Os termos da Resolução (APTA,
  INAPTA…) continuam em maiúsculas por serem a designação oficial.
- **Textos:** frases curtas, verbo no botão ("Imprimir ficha", "Exportar
  planilha"), estado vazio dizendo o que fazer.
