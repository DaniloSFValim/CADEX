/** Brasão oficial do município, em data URL, para o cabeçalho dos documentos. Sem ele, o PDF sai sem brasão. */
export async function lerBrasao(): Promise<string | undefined> {
  try {
    const r = await fetch('/brasao-oficial.png');
    if (!r.ok) return undefined;
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}
