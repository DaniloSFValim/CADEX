// Cloudflare Pages Function: repassa /anatel/<arquivo> para os dados abertos do
// NETRANK RJ. Equivale ao rewrite /anatel/niteroi.json da vercel.json e ao proxy
// de desenvolvimento no vite.config.ts. Mantido server-side para não expor o
// cruzamento Anatel×CADEX a chamadas diretas do navegador de outra origem.
const BASE = 'https://netranking-rj.labdados.org/data/municipios';

export async function onRequest(context) {
  const partes = context.params.path; // catch-all: array de segmentos após /anatel/
  const caminho = Array.isArray(partes) ? partes.join('/') : partes;
  const resposta = await fetch(`${BASE}/${caminho}`, { headers: { accept: 'application/json' } });
  return new Response(resposta.body, {
    status: resposta.status,
    headers: {
      'content-type': resposta.headers.get('content-type') ?? 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
}
