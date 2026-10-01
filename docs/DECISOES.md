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

### Outros setores: gás, saneamento, drenagem e construção (01/10/2026)
- A Resolução nº 001/2026 vale **só para telecom**. Nos outros setores a
  licença não exige empresa APTA, ART nem vínculo da subcontratada; os
  documentos da inscrição ficam como registro (opção "b" da SECONSER).
- Tipos de empresa: **operadora** (telecom), **concessionária** (um setor:
  gás = Naturgy, saneamento = Águas de Niterói), **construtora** (pessoa
  jurídica que constrói imóveis, com licença de obra da Prefeitura) e
  **terceirizada** (um ou mais setores: telecom, gás, saneamento, drenagem).
- Códigos CADEX: OPE (operadora), GAS e SAN (concessionárias), CON
  (construtora), TER (terceirizada). Tipo, CNPJ, código e o setor da
  concessionária não mudam depois do cadastro.
- Documentos (O = obrigatório, Q = quando aplicável):
  - todos os perfis: cartão CNPJ, contrato social, documentos dos sócios,
    certidões negativas federal, estadual e municipal, registro do RT e
    ART/RRT de cargo (O);
  - operadora e concessionárias: declaração de regularidade no órgão
    regulador (O; Anatel ou AGENERSA) e mapa da infraestrutura (Q);
  - operadora: contrato de compartilhamento e comprovante de adimplência (Q);
  - terceirizadas não entregam a declaração do regulador: ela é da
    concessionária.
  - CRF/FGTS, CNDT e relação de equipamentos e pessoal deixam de ser
    exigidos de todos.
- "Contratada por" só é obrigatório para terceirizada de telecom. Quem contrata
  terceirizadas: operadora, concessionária ou construtora.
- Drenagem: ligação de imóvel particular à rede pública, executada por
  terceirizada ou pela própria construtora. Exige o endereço do imóvel, o
  processo de licenciamento da obra no Urbanismo e o contratante (construtora
  cadastrada ou dono do imóvel com CPF ou CNPJ), salvo quando a própria
  construtora executa. Nome de pessoa física não aparece nas páginas públicas.
- Novos tipos de obra: ligação predial, galeria de drenagem, boca de lobo e
  recomposição de pavimento.
- Mapa e consulta pública ganham filtro por setor.

### Encerramento automático da sessão (01/10/2026)
- Sem uso por **30 minutos**, a sessão encerra (aviso com contagem no último
  minuto, "Continuar conectado"); **12 horas** depois do login com senha, pede
  login de novo mesmo em uso. Vale para todas as abas do navegador.
- "Sair" encerra só este navegador; "Sair de todos os dispositivos" (Minha
  conta) encerra a sessão em todos os computadores e celulares.
- A proteção roda no navegador (computador esquecido aberto). Limite de sessão
  no servidor depende das configurações do Supabase (Authentication → Sessions).
