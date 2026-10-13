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

### Painel administrativo (13/10/2026)
- A gestão de contas já existia (`admin_*` e a Edge Function `admin-contas`) e foi
  **aproveitada**: nenhuma conta, senha ou perfil foi recriado. Ela passou a ser
  a aba "Contas e acessos" da Administração (`/admin`); `/contas` redireciona.
- **Desativar em vez de apagar**: `servidores.ativo`. Desativado, o servidor não
  passa em `is_servidor`, `is_gestor`, `is_licenciador` nem `is_administrador`,
  então o banco recusa tudo mesmo com a sessão aberta. A tela passa a tratá-lo
  como sem acesso. A remoção do acesso (`admin_remover_acesso`) segue no banco,
  mas a tela só desativa e reativa.
- **Último administrador ativo protegido** por gatilho em `servidores`, valendo
  para qualquer caminho (função, atualização direta, exclusão da conta de
  login) e serializado por bloqueio consultivo. Verificado com duas sessões
  concorrentes: sem o bloqueio, dois administradores se rebaixam ao mesmo tempo
  e sobram 0; com ele, a segunda mudança espera e é recusada.
- **Empresa desativável** (`empresas.ativa`), só pelo administrador (o banco
  recusa os demais). A empresa desativada não pode ser escolhida em licença nova
  nem passar a ocupar um papel em licença existente; o que já existe não muda.
  A consulta pública não foi alterada.
- **Auditoria imutável e do administrador**: gatilhos recusam alterar, apagar e
  esvaziar `auditoria`, até com acesso direto ao banco. Para uma retenção legal,
  só desligando o gatilho de propósito. A leitura passou de "qualquer gestor"
  para "administrador" (com o código do aplicativo): os valores incluem dados dos
  documentos e CPFs, e nenhuma outra tela lê a tabela.
- **Configurações**: mostram o que existe (perfis com a contagem de contas
  ativas, órgãos públicos, prazos da Resolução). Prazos, categorias de empresa,
  setores e tipos de obra **não são editáveis**: são regras do modelo e do
  banco; um campo de tela que o banco recusasse seria enganoso. Mudá-los exige
  uma migração versionada.
- Eventos de acesso: a tela mostra o último acesso de cada conta e as mudanças
  administrativas (auditoria de `servidores`). O registro de logins do Supabase
  Auth não foi integrado.
- Reversão da migração `20261013130000`: remover os gatilhos e funções novas,
  as colunas `servidores.ativo` e `empresas.ativa`, e reaplicar as quatro
  funções `is_*` sem `and ativo`. Nada existente é alterado: as colunas nascem
  verdadeiras.

### Painel gerencial (13/10/2026)
- Visão geral das licenças em `/dashboard` (gestor e CISP); as pendências de ação
  do gestor ficaram em `/dashboard/pendencias`. Tudo sai do mesmo conjunto
  filtrado, lido do banco.
- O CADEX não registra a data efetiva de início da obra, só o período previsto e
  a conclusão. Por isso nada é dado como começado ou terminado só porque uma data
  passou: "em execução" é deferida, sem conclusão, com o período previsto em curso.

### Licenças: sem "Indeferida", período da obra e papéis (13/10/2026)
- A situação **"Indeferida"** deixou de ser registrável. O banco recusa a entrada
  nova (INSERT ou mudança para "indeferida"); licença que já esteja indeferida
  permanece no histórico e continua editável sem trocar de situação. Na
  produção não havia nenhuma licença na data desta decisão.
- As duas datas do período da intervenção são **"Início da obra ou serviço"** e
  **"Fim da obra ou serviço"** (colunas `inicio_previsto` e `fim_previsto`, sem
  coluna nova). O fim não pode ser anterior ao início.
- **Contratante e executora podem ser a mesma empresa cadastrada**
  (`contratante_id = executora_id`): a titular (operadora, concessionária,
  construtora) executando a própria obra. A terceirizada continua exigindo
  contratante e não contrata a si mesma; a titular continua sem contratante
  diferente de si fora da drenagem e do registro histórico.
- Reversão: reaplicar `licencas_antes_de_gravar()` de
  `20261010120000_recomposicao_e_conflitos.sql`. Nenhum dado é alterado.

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

### Exportação em PDF e planilha (03/10/2026)
- Empresas, licenças de obra e o cruzamento Anatel × CADEX saem em **PDF**
  (para anexar ao SEI) ou em planilha, com o mesmo conteúdo.
- Empresas: filtros por tipo e situação, colunas à escolha e agrupamento por
  tipo, setor, situação ou contratante (terceirizada aparece sob cada
  contratante). Licenças: sai a lista da tela (busca e filtros aplicados),
  com colunas à escolha e agrupamento por setor, situação, executora,
  contratante, bairro ou ano da decisão.
- O PDF traz cabeçalho da Prefeitura/SECONSER, filtros, total, data e hora da
  emissão, quem emitiu e "Página X de Y". Contratante pessoa física (dono de
  imóvel na drenagem) sai como "Particular".

### Titular que executa a própria obra: marca no cadastro (14/10/2026)
- O cadastro da empresa (operadora, concessionária, construtora) ganhou a opção
  "Esta empresa também executa obras ou serviços por conta própria"
  (`empresas.executa_obras`, padrão desmarcado). Terceirizada não usa: o banco recusa.
- Só com a marca a licença aceita a mesma empresa como contratante e executora ("A
  própria contratante executará a obra ou serviço"). Sem ela, a caixa fica
  desabilitada com o motivo e um atalho para o cadastro; o banco também recusa.
- A regra vale para a licença nova ou para a que troca de contratante/executora.
  Licença já registrada continua editável mesmo que a marca seja tirada depois; a
  Administração → Licenças aponta esse caso para revisão.
- Na migração, empresa que já constava como contratante e executora de alguma
  licença foi marcada, para o cadastro refletir o que já estava registrado.

### Tipo e origem da intervenção; obra pública; correção do mapa (15/10/2026)
- Todo registro tem **tipo de intervenção** (obra ou serviço, obrigatório no formulário) e **origem**
  (concessionária ou prestadora; Prefeitura ou órgão municipal; autarquia municipal; órgão estadual ou federal).
  As licenças existentes ficaram como "obra" e "concessionária" (ou pela esfera do órgão, se já tinham órgão).
  A quarta origem existe porque órgão estadual ou federal já podia contratar; sem ela essas licenças ficariam sem categoria.
- Origem pública exige o **órgão certo** (cadastro de Órgãos públicos, agora com "natureza": administração direta ou
  autarquia); concessionária não aceita órgão. O banco confere; a tela só oferece as combinações válidas.
- Obra pública: contratante = órgão ou autarquia, executora = empresa (empreiteira) do cadastro. **Não existe** "a própria
  Prefeitura executa": a executora é sempre uma empresa. Se esse caso aparecer, é regra nova a decidir.
- Dados do contrato (nº do contrato, processo administrativo, ordem de serviço, objeto) são opcionais e **não vão à consulta
  pública**. Os órgãos e autarquias não foram cadastrados por mim: são dados da Prefeitura (Órgãos públicos).
- **Mapa.** Causa confirmada de um defeito: licença cancelada sem data de decisão (o banco permite) derrubava a página
  inteira (`decisao_data.slice` em nulo). Corrigido, com teste que reproduz. Também: o que o filtro inicial esconde
  agora é avisado ("N fora dos filtros", "Mostrar tudo"); obra sem localização é marcada na lista; coordenada inválida
  não é desenhada nem inventada; o balão mostra tipo, descrição, contratante, executora, período e situação.
