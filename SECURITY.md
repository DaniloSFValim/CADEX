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

`anon` não tem grant em nenhuma tabela. O público alcança apenas as views
`public_companies` e `public_interventions` e duas funções de verificação.

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

## Pendências de segurança

- Rate limiting nas funções públicas de verificação (hoje ausente; o token
  de 128 bits torna enumeração inviável, mas não impede varredura).
- Rotina de backup e teste de restauração (depende do plano contratado).
- Revisão de `search_path` por função `security definer` — todas já fixam
  `set search_path`, mas convém auditar a cada nova função.
