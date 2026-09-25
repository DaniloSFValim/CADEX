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
- **Consulta pública** em `/consulta`, sem login (art. 7º, § 2º): código,
  razão social, nome fantasia, CNPJ, tipo, contratantes, situação,
  validade e portaria.
  Nenhum contato, pessoa, veículo ou documento.

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

## Liberar um servidor

1. Supabase → **Authentication → Users → Add user** (marque *Auto Confirm User*).
2. Supabase → **SQL Editor** (`papel`: `'gestor'` para a SECONSER, `'cisp'` para consulta):

   ```sql
   insert into servidores (user_id, nome, papel)
   select id, 'NOME DO SERVIDOR', 'gestor' from auth.users where email = 'EMAIL@niteroi.rj.gov.br';
   ```

Para tirar o acesso: `delete from servidores where user_id = (select id from auth.users where email = '...');`

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

## Publicação

- **Banco:** aplicar `supabase/migrations/*.sql` no projeto Supabase.
- **Site:** Vercel, projeto `cadex-niteroi`, ligado a este repositório;
  cada merge na `main` publica sozinho. Variáveis: `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY`.
