# CADEX — Cadastro de empresas

Cadastro das empresas de telecomunicações e de suas terceirizadas pela
Prefeitura de Niterói, com a documentação exigida pelo art. 6º da
Resolução Conjunta SECONSER/SEOP nº 001/2026.

- **Empresas:** código CADEX, CNPJ (validado), razão social, nome
  fantasia, tipo — operadora (concessionária contratante) ou terceirizada
  (empresa executora), nos termos do art. 2º —, contatos e endereço.
- **Código CADEX:** gerado no cadastro e permanente —
  `CADEX-OPE-2026-0001` para operadoras de telecomunicações e
  `CADEX-TER-2026-0001` para terceirizadas; numeração própria por tipo,
  recomeçando a cada ano. Como o tipo está no código, ele não muda depois
  do cadastro. O formato é convenção da Prefeitura: a Resolução não
  define numeração.
- **Vínculos de contratação:** contratante → contratada. Operadoras
  contratam terceirizadas, e uma terceirizada pode subcontratar outra em
  qualquer grau (arts. 2º, VIII, e 3º, § 1º) — toda empresa da cadeia é
  cadastrada e tem código CADEX. Uma terceirizada pode ter várias
  contratantes. O banco recusa ciclos. Encerrar um vínculo guarda a data
  de fim, sem apagar o histórico.
- **Documentos do art. 6º:** 15 tipos; 12 obrigatórios (incisos I a III)
  e 3 aplicáveis só a quem tem infraestrutura própria ou contrato de
  compartilhamento (incisos IV e V). Certidões e registros têm validade,
  com aviso 30 dias antes de vencer.
- **Inscrição no CADEX (arts. 7º e 8º):** situação (EM ANÁLISE, APTA,
  APTA – EM SANEAMENTO, INAPTA, INDEFERIDA; VENCIDA quando passa a
  validade), nº do processo, data do requerimento, **portaria (nº e data
  de publicação)**, validade de 12 meses e data da notificação para
  saneamento. O banco só aceita APTA com a portaria e INAPTA depois de 30
  dias da notificação. Toda mudança fica no histórico.
- **Identificação de pessoal e veículos:** responsáveis técnicos
  (conselho, registro, ART/RRT — art. 6º, II), pessoal técnico com dados
  do crachá (art. 23) e veículos/maquinário com placa e identificação
  visual (arts. 19 e 21). Nada é apagado: desativar mantém o histórico.
- **Perfis:** `gestor` (SECONSER) cadastra e altera; `cisp` só consulta
  empresas, inscrição, vínculos, responsáveis, pessoal e veículos — não
  vê os documentos, que têm dados pessoais de sócios e procuradores.
- **Consulta pública** em `/consulta`, sem login (art. 7º, § 2º): logo,
  código, razão social, nome fantasia, CNPJ, tipo, contratantes, situação,
  validade e portaria.
  Nenhum contato, pessoa, veículo ou documento.
- **Logo da empresa:** PNG, JPG ou WebP até 2 MB, enviado pelo gestor.
  Fica no bucket público `logos` (os documentos seguem no bucket privado).
- **Exportação:** relação de empresas em planilha (.csv que abre no
  Excel), filtrando tipos, situações e as colunas; ficha da empresa pronta
  para imprimir ou salvar em PDF, escolhendo as seções. O CISP exporta o
  que já consulta — sem documentos.

## Regras pendentes de definição administrativa

- **Termo inicial da validade:** o sistema conta os 12 meses da data de
  publicação da portaria; a Resolução diz só "inscrição deferida".
- **Inscrição vencida:** passados os 12 meses sem renovação, o sistema
  mostra VENCIDA. A Resolução não nomeia esse estado nem diz se ele segue
  o rito do art. 8º (notificação + 30 dias).
- **Incisos IV e V do art. 6º:** tratados como "quando aplicável"; se a
  SECONSER exigir declaração negativa, é ajuste de catálogo.
- **Veículo que atende várias operadoras:** o art. 21 pede o nome da
  concessionária contratante na traseira; o sistema registra uma.

A versão anterior, com licenciamento, fiscalização e emergências, está
guardada no ramo `legado`.

## Tecnologia

React + Vite + Tailwind no navegador; Supabase (Postgres, login e
arquivos) como banco. As regras ficam no banco: CNPJ válido e único,
validade obrigatória nos documentos que vencem, código CADEX gerado pelo
banco, contratada sempre terceirizada e sem ciclos na cadeia, e acesso
restrito a servidores (RLS).

## Contas e acessos

Pelo site, em **Contas** (só para administrador): criar conta com senha
provisória, dar ou tirar acesso, escolher o perfil (`gestor` para a
SECONSER, `cisp` para consulta), marcar quem é administrador e redefinir
senhas. Cada pessoa troca a própria senha em **Minha conta** (clique no
nome, no alto da página). Toda mudança fica na auditoria.

- Ninguém tira a própria administração nem remove o próprio acesso: o
  sistema não fica sem administrador por engano.
- Criar conta e redefinir senha passam pela Edge Function `admin-contas`
  (`supabase/functions/admin-contas`), a única que usa a chave de serviço.

Primeiro administrador, ou recuperação se todos perderem o acesso (SQL
Editor):

```sql
update servidores set administrador = true
 where user_id = (select id from auth.users where email = 'EMAIL');
```

## Rodar localmente

```bash
cp .env.example .env   # preencha a URL e a anon key do Supabase
npm install
npm run dev
```

## Testes

```bash
npm test          # regras do frontend (CNPJ, vencimento dos documentos)
npm run db:test   # banco: migrations + regras e acesso, num Postgres local
```

## Backup

Cópia diária automática do banco e de todos os arquivos, criptografada,
guardada por 90 dias no GitHub Actions. Configuração e restauração:
[docs/BACKUP.md](docs/BACKUP.md).

## Publicação

- **Banco:** aplicar `supabase/migrations/*.sql` no projeto Supabase.
- **Site (Vercel):** projeto `cadex-niteroi`, ligado a este repositório;
  cada merge na `main` publica sozinho. Variáveis: `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY`. Config em `vercel.json`.

## Licença

- **Código-fonte:** GNU Affero General Public License v3.0 (AGPL-3.0). Texto integral em [`LICENSE`](LICENSE).
- **Documentação e dados:** Creative Commons Atribuição 4.0 Internacional (CC BY 4.0).
- **Autor:** Danilo Valim (ORCID [0009-0009-7250-6151](https://orcid.org/0009-0009-7250-6151)).

Quem usar, modificar ou distribuir este sistema deve manter estes avisos de autoria e licença. A AGPL também exige que versões modificadas oferecidas pela rede tenham o código-fonte disponível.
