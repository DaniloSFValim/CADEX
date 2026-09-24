# CADEX — Cadastro de empresas

Cadastro das empresas de telecomunicações e de suas terceirizadas pela
Prefeitura de Niterói, com a documentação exigida pelo art. 6º da
Resolução Conjunta SECONSER/SEOP nº 001/2026.

- **Empresas:** código CADEX, CNPJ (validado), razão social, nome
  fantasia, tipo (operadora ou terceirizada), contatos, endereço e
  situação (ativa/inativa).
- **Código CADEX:** gerado no cadastro e permanente —
  `CADEX-OPE-2026-0001` para operadoras de telecomunicações e
  `CADEX-TER-2026-0001` para terceirizadas; numeração própria por tipo,
  recomeçando a cada ano. Como o tipo está no código, ele não muda depois
  do cadastro. O formato é convenção da Prefeitura: a Resolução não
  define numeração.
- **Vínculos:** uma terceirizada pode atender várias operadoras. Encerrar
  um vínculo guarda a data de fim, sem apagar o histórico.
- **Documentos do art. 6º:** 15 tipos; 12 obrigatórios (incisos I a III)
  e 3 aplicáveis só a quem tem infraestrutura própria ou contrato de
  compartilhamento (incisos IV e V). Certidões e registros têm validade,
  com aviso 30 dias antes de vencer.
- **Acesso:** só servidores da Prefeitura, com login. Nada é público.

A versão anterior, com licenciamento, fiscalização e emergências, está
guardada no ramo `legado`.

## Tecnologia

React + Vite + Tailwind no navegador; Supabase (Postgres, login e
arquivos) como banco. As regras ficam no banco: CNPJ válido e único,
validade obrigatória nos documentos que vencem, código CADEX gerado pelo
banco, vínculo só de terceirizada com operadora e acesso restrito a
servidores (RLS).

## Liberar um servidor

1. Supabase → **Authentication → Users → Add user** (marque *Auto Confirm User*).
2. Supabase → **SQL Editor**:

   ```sql
   insert into servidores (user_id, nome)
   select id, 'NOME DO SERVIDOR' from auth.users where email = 'EMAIL@niteroi.rj.gov.br';
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
