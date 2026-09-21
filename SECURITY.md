# Segurança

## Modelo de ameaça assumido

1. Cliente adulterado ou requisição direta à API com a `anon key`
   (pública por desenho).
2. Usuário autenticado tentando alcançar dados de outra empresa.
3. Usuário autenticado tentando ampliar o próprio papel.
4. Adulteração ou apagamento de trilha de auditoria.
5. Acesso a documento ou fotografia por URL adivinhada.

Cada uma tem contramedida no banco e teste correspondente (exceto 5, cuja
política vive no schema `storage` e só é exercível em projeto Supabase).

## Autenticação

Supabase Auth (GoTrue). Autocadastro **desabilitado**: contas são criadas
pela administração. Senha mínima de 10 caracteres. O perfil e os papéis são
lidos do banco sob RLS — nunca de claims do token, que o cliente enxerga.

## Autorização

RLS habilitada **e forçada** (`force row level security`) em todas as
tabelas de domínio — `force` faz a policy valer inclusive para o dono da
tabela. Negação por padrão: sem policy, nada passa.

As funções de papel são `security definer` por necessidade: as policies
consultam `user_roles`, que também tem RLS; sem `definer` a avaliação
recursa.

`anon` não tem grant em nenhuma tabela — mas isso **precisou ser imposto
explicitamente** (migration 10). O Supabase configura, em projeto novo,
um privilégio-padrão que concede a `anon` acesso a toda tabela e EXECUTE
em toda função criada no schema `public`. A primeira aplicação real
nasceu, portanto, com `anon` enxergando `companies`, `interventions` e
`audit_logs` no nível de GRANT — sem vazar linha alguma, porque a RLS
barrava, mas com a defesa apoiada numa camada só.

Hoje o público alcança exatamente duas views (`public_companies`,
`public_interventions`) e duas funções (`verify_public_token`,
`interventions_near`). Verificável:

```sql
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r'
   and has_table_privilege('anon', c.oid, 'SELECT');   -- deve ser 0
```

**Limitação conhecida:** existe um segundo conjunto de privilégios-padrão
definido pelo papel `supabase_admin`, que a conexão de migration não tem
poder para alterar. Ele rege apenas objetos criados por `supabase_admin`
— internos da plataforma, não deste sistema. Objetos das migrations
nascem sob o default do `postgres`, que é o corrigido.

## Storage

Seis buckets, todos privados, com limite de tamanho e lista de MIME types
por bucket. Convenção de caminho: o primeiro segmento é o id da entidade
dona, o que permite decidir acesso sem abrir o arquivo. O cliente valida
tamanho e tipo antes do upload — conveniência, não barreira; a barreira é
a configuração do bucket.

## Segredos

No frontend só existem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`,
ambos públicos por desenho. A `service_role` key **nunca** entra em
variável `VITE_*` — ela ignora RLS e só deve existir no agendador do
servidor. `.env` está no `.gitignore`.

## Auditoria

14 tabelas com trigger de auditoria registrando usuário, ação, entidade,
valor anterior e novo. `audit_logs` recusa UPDATE e DELETE por trigger,
para qualquer papel da aplicação. Leitura restrita a admin e gestor.

## LGPD

Minimização aplicada na fronteira pública: as views `public_*` não contêm
CPF, e-mail, telefone, endereço residencial, fotografia nem caminho de
documento — e há teste que falha se alguém acrescentar uma dessas colunas.
Identificação de trabalhador só é revelada pela função `verify_badge`, que
exige papel de fiscalização e devolve apenas o necessário à conferência
presencial.

## Falhas encontradas no primeiro deploy real

Três defeitos passaram pela suíte local e só apareceram num projeto
Supabase de verdade. A causa comum: **os testes rodavam como
superusuário, que ignora RLS e ignora GRANT**, e o Postgres local não
reproduzia os privilégios-padrão do Supabase.

1. **`work_orders` com RLS habilitada e forçada, sem policy alguma.**
   O módulo de Ordem de Serviço (art. 25) estava inacessível a todos os
   papéis da aplicação. Não era vazamento — era negação total silenciosa.
2. **`anon` podia executar todas as RPC.** O PostgreSQL concede EXECUTE
   a PUBLIC por padrão; o `grant ... to authenticated` que eu escrevia
   era decorativo. Duas funções não tinham checagem interna de papel
   (`start_intervention`, `regularize_emergency`) e ficavam abertas a
   quem conhecesse um UUID. Identificador difícil de adivinhar não é
   controle de autorização.
3. **`anon` com SELECT em todas as tabelas**, pelo privilégio-padrão
   descrito acima.

Correções nas migrations 09 e 10. Três testes novos travam o
comportamento, incluindo um genérico que falha se **qualquer** tabela
ficar com RLS sem policy.

## A falha de autoridade decisória (migration 11)

As policies das migrations 04 concedem `for all` ao interessado sobre as
linhas da própria intervenção. Isso está certo para o que ele declara e
errado para o que registra a decisão da administração — e era a mesma
policy nos dois casos.

Reproduzido em banco real, com papel não superusuário e sob identidade de
uma empresa com CADEX ativo:

```sql
update licenses
   set status = 'deferida', license_number = 'LIC-FORJADA-0001',
       valid_until = current_date + 365
 where id = <licença da própria empresa>;
-- aceito. Em seguida, start_intervention autorizava a obra.
```

`cadex.approve_license` checa o papel de quem a chama — mas ninguém é
obrigado a chamá-la. O PostgREST expõe a tabela, e a tabela é a fonte da
verdade. Uma empresa emitia a própria licença de obra em via pública.

A mesma brecha permitia:

- **retroagir `declarations.registered_at`**, que é justamente a prova de
  que o registro antecedeu o deslocamento (art. 17);
- **lançar `emergencies.concluded_at` no futuro**, empurrando para diante
  o prazo de 24 horas do art. 20;
- **declarar-se `regularizada`** sem protocolo CISP, sem descrição do
  serviço e sem foto — os três requisitos que `regularize_emergency`
  exige e que o UPDATE direto ignorava, inclusive escapando do
  `fora_do_prazo`.

**Princípio adotado:** o interessado escreve o que ele declara; quem lavra
o que a administração decide é a administração. Onde o próprio
interessado pratica o ato (iniciar a obra licenciada, regularizar a
emergência), o registro é carimbado pelo servidor, não aceito do cliente.

As transições que o requerente pratica por direito próprio são quatro, e
só elas: `rascunho → protocolada`, `rascunho → cancelada`,
`deferida → em_execucao` e `em_execucao → concluida`.

`supabase/tests/06_autoridade_decisoria.sql` reproduz cada uma das quatro
tentativas e exige que o banco recuse.

## O inverso: regra que impedia o cumprimento (migration 14)

`cadex.is_company_active` era função SQL comum — SECURITY INVOKER — e
rodava sob a RLS de quem a chamasse. Como a policy de `companies` diz que
uma empresa só enxerga a si própria, o trigger do art. 11 não achava a
linha da concessionária e recusava a intervenção com "Concessionária
contratante sem CADEX ativo", sobre empresa que estava ativa.

Nenhuma empresa conseguia registrar intervenção nomeando contratante ou
subcontratada — a hipótese que o art. 11 existe para disciplinar. As
funções de decisão de acesso (`has_role`, `is_staff`,
`current_company_id`, `can_see_intervention`) já eram SECURITY DEFINER
pelo mesmo motivo; esta ficou de fora.

Não há vazamento na correção: ela devolve um booleano sobre fato que o
art. 7º, § 2º manda publicar. A relação de empresas com CADEX ativo já é
pública em `public_companies`, inclusive para `anon`.

Esta falha não apareceu em teste nenhum: a suíte inseria como
superusuário. Apareceu ao percorrer o formulário de licenciamento como
uma empresa de verdade.

## Pendências de segurança

- Rate limiting nas funções públicas de verificação (hoje ausente; o token
  de 128 bits torna enumeração inviável, mas não impede varredura).
- Rotina de backup e teste de restauração (depende do plano contratado).
- Revisão de `search_path` por função `security definer` — todas já fixam
  `set search_path`, mas convém auditar a cada nova função.
- **`maplibre-gl` ^4.7.1 está na faixa de um XSS crítico**
  (GHSA — bypass do sanitizador em `DOM.sanitize()`, afeta `<= 6.4.0`;
  correção em 6.10.0, salto de major). O código escapa manualmente o que
  entrega a `setHTML` em `MapView`, e o editor de geometria não usa popup
  — mas a defesa não deveria depender de uma camada só. Atualizar merece
  ser mudança própria, com verificação visual, e não carona numa entrega
  de funcionalidade. `react-router-dom` tem dois avisos moderados na
  mesma situação. Reproduzir com `npm audit --omit=dev`.
- Não há limite geográfico para a geometria submetida: o banco aceita
  qualquer coordenada válida em SRID 4326, inclusive fora de Niterói. Um
  `check` sobre o perímetro municipal depende da base oficial de limites,
  que não está disponível neste repositório — e inventar um retângulo
  seria pior do que não ter regra.
