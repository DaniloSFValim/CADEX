// Baixa todos os arquivos de todos os buckets do Supabase Storage.
//
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs <pasta-destino>
//
// Percorre os buckets existentes (inclusive os que forem criados no futuro)
// e grava <pasta-destino>/<bucket>/<caminho>. Termina com erro se algum
// arquivo falhar, para o backup não passar como completo.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const destino = process.argv[2];
if (!url || !chave || !destino) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou a pasta de destino.');
  process.exit(2);
}

const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };

async function api(caminho, init = {}) {
  const r = await fetch(`${url}/storage/v1/${caminho}`, {
    ...init, headers: { ...cabecalhos, ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${caminho}: HTTP ${r.status} ${await r.text()}`);
  return r;
}

/** Lista recursivamente; itens sem id são pastas. */
async function listar(bucket, prefixo = '') {
  const arquivos = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await api(`object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefixo, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    const itens = await r.json();
    for (const it of itens) {
      const caminho = prefixo ? `${prefixo}/${it.name}` : it.name;
      if (it.id === null) arquivos.push(...await listar(bucket, caminho));
      else arquivos.push(caminho);
    }
    if (itens.length < 1000) break;
  }
  return arquivos;
}

const buckets = await (await api('bucket')).json();
const resumo = [];
let falhas = 0;

for (const b of buckets) {
  const arquivos = await listar(b.id);
  let bytes = 0;
  for (const caminho of arquivos) {
    try {
      const r = await api(`object/${encodeURIComponent(b.id)}/${caminho.split('/').map(encodeURIComponent).join('/')}`);
      const dados = Buffer.from(await r.arrayBuffer());
      const alvo = join(destino, b.id, ...caminho.split('/'));
      await mkdir(dirname(alvo), { recursive: true });
      await writeFile(alvo, dados);
      bytes += dados.length;
    } catch (e) {
      falhas++;
      console.error(`Falhou: ${b.id}/${caminho}: ${e.message}`);
    }
  }
  resumo.push({ bucket: b.id, publico: b.public, arquivos: arquivos.length, bytes });
}

await mkdir(destino, { recursive: true });
await writeFile(join(destino, 'buckets.json'), JSON.stringify({ gerado_em: new Date().toISOString(), buckets: resumo }, null, 2));
for (const r of resumo) console.log(`${r.bucket}: ${r.arquivos} arquivo(s), ${r.bytes} bytes`);
if (falhas) {
  console.error(`${falhas} arquivo(s) não baixado(s).`);
  process.exit(1);
}
