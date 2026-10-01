import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** QR Code em SVG (nítido na impressão), gerado no navegador. */
export function QrCode({ texto, tamanho = 160, className = '' }: { texto: string; tamanho?: number; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let vivo = true;
    // Nível M: aguenta sujeira e desgaste da placa sem crescer demais.
    QRCode.toString(texto, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((s) => { if (vivo) setSvg(s); })
      .catch(() => { if (vivo) setSvg(''); });
    return () => { vivo = false; };
  }, [texto]);
  return (
    <div role="img" aria-label={`QR Code: ${texto}`} className={className}
         style={{ width: tamanho, height: tamanho }}
         // SVG gerado pela biblioteca a partir do nosso próprio endereço.
         dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
