# Decisões administrativas

Registro das decisões que orientam o sistema e das que ainda estão em aberto.
Atualize ao decidir; o código cita este arquivo onde a regra depende dele.

## Em aberto

### Quem analisa e decide as licenças de obra
Pendente (registrado em 01/10/2026). Até a definição, só o perfil **gestor**
registra e altera licenças; o **CISP** apenas consulta. Se for criado um perfil
próprio (ex.: analista de licenciamento), as políticas de `licencas` e
`licenca_trechos` passam a aceitá-lo.

## Decididas

### Licenças de obra (01/10/2026)
- O CADEX **registra** licenças; o pedido tramita e é decidido no **SEI**.
- Nº do processo em **texto livre** (01/10/2026): o SEI usa
  `NIT-050120/000000/2026` (setor, número do SEI, ano), mas as licenças até
  2025/início de 2026 seguem outra numeração.
- Nº da licença: numeração própria da SECONSER, **digitada** no deferimento
  (o sistema não gera a sequência).
- Documentos (planta, cronograma, ART, As Built) ficam **só no SEI**; o CADEX
  guarda o nº do processo e, no As Built, o nº do documento SEI.
- Deferir exige executora e subcontratada **APTAS** no CADEX (arts. 4º e 8º,
  § 2º): o banco bloqueia.
- Serviços de manutenção rotineira (art. 15) ficam para depois, quando houver
  acesso das empresas ao sistema.
- Ainda não há contas de empresa: só servidores usam o sistema nesta etapa.

### Licenças anteriores à Resolução (01/10/2026)
- A SECONSER cadastra, **uma a uma**, as licenças emitidas nos últimos 5 anos
  ("emitiu licença, cadastramos").
- Licença com decisão **anterior a 09/09/2026** é registro histórico (calculado
  pela data da decisão, não marcado à mão): não exige empresa APTA, vínculo da
  subcontratada nem ART; executora e contratante podem ser só razão social e
  CNPJ, sem entrar no cadastro nem na consulta pública de empresas.
- Número, cronograma, trechos com coordenadas e data da decisão continuam
  obrigatórios.

### Mapa público de obras (01/10/2026)
- Mostra **todas** as licenças cadastradas; base de mapa **gratuita**.
- Abre nas vigentes e nas que vão começar; o filtro mostra todas, por ano.
- Base do mapa: recorte de Niterói do OpenStreetMap (Protomaps), gerado pela
  automação "Base do mapa" e servido pelo próprio site (`public/mapa`), sem
  serviço de terceiros. Se o arquivo faltar, o mapa usa os blocos públicos do
  OpenStreetMap, que não têm garantia de disponibilidade.
- Fica na consulta pública, aba "Obras licenciadas" (`/consulta/obras`).
