# Backup do CADEX

Todo dia às 02:17 (Brasília) o GitHub Actions (`.github/workflows/backup.yml`)
gera uma cópia completa e guarda por **90 dias**:

- **Banco:** esquemas `public` (empresas, inscrição, vínculos, pessoal,
  veículos, documentos, histórico e qualquer tabela futura), `auth`
  (logins) e `storage` (índice dos arquivos).
- **Arquivos:** todos os buckets do Storage (documentos e logos, e buckets
  futuros).
- Tudo num `.tar.gz` criptografado (AES-256) com a senha `BACKUP_PASSPHRASE`.
  Sem a senha o arquivo não abre, nem para quem o baixar.

O backup do plano pago do Supabase não inclui os arquivos do Storage; esta
rotina inclui.

## Configurar (uma vez)

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Segredo | De onde vem |
|---|---|
| `SUPABASE_DB_URL` | Supabase → **Connect** → *Session pooler* (URI). Troque `[YOUR-PASSWORD]` pela senha do banco. Use o *pooler*: a conexão direta não funciona no GitHub. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API Keys** → chave `service_role` (secreta). |
| `BACKUP_PASSPHRASE` | Uma senha forte, com 20 caracteres ou mais, criada por você. **Guarde-a fora do GitHub** (cofre de senhas da SECONSER): sem ela nenhum backup pode ser aberto. |

Depois: **Actions → Backup → Run workflow** para gerar o primeiro e conferir.

## Baixar um backup

**Actions → Backup →** escolha a execução do dia **→ Artifacts →**
`cadex-backup-AAAA-MM-DD`.

## Abrir

```bash
unzip cadex-backup-AAAA-MM-DD.zip            # o GitHub entrega zipado
gpg -d cadex-backup-AAAA-MM-DD.tar.gz.gpg | tar -xz -C backup/
cd backup && sha256sum -c SHA256SUMS         # confere a integridade
```

Conteúdo: `banco.dump` (formato do `pg_dump`), `banco-conteudo.txt` (lista do
que está no dump), `arquivos/<bucket>/...` e `arquivos/buckets.json`.

## Restaurar

Num projeto Supabase novo (ou no mesmo, após perda de dados):

1. Banco (PostgreSQL 17):
   ```bash
   pg_restore --dbname "<SUPABASE_DB_URL do projeto de destino>" \
     --no-owner --no-privileges --clean --if-exists --schema=public banco.dump
   ```
   Para recuperar também os logins, repita com `--schema=auth` (só em
   projeto novo, antes de qualquer usuário ser criado).
2. Arquivos: recrie os buckets `documentos` (privado) e `logos` (público) e
   envie as pastas de `arquivos/<bucket>/` mantendo os mesmos caminhos
   (Supabase → Storage → upload, ou `supabase storage cp -r`).
3. Confira no site uma empresa com documentos e logo.

Teste uma restauração a cada semestre: backup que nunca foi restaurado não
é garantia.
