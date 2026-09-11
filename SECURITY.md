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

## Pendências de segurança

- Rate limiting nas funções públicas de verificação (hoje ausente; o token
  de 128 bits torna enumeração inviável, mas não impede varredura).
- Rotina de backup e teste de restauração (depende do plano contratado).
- Revisão de `search_path` por função `security definer` — todas já fixam
  `set search_path`, mas convém auditar a cada nova função.
