/**
 * Pedido de licença de obra de infraestrutura — arts. 10 a 14.
 *
 * Como em todo o resto do sistema, o que está aqui é conferência
 * imediata para o usuário. A regra vale no banco: triggers recusam
 * protocolo sem a instrução do art. 12, recusam trecho sem coordenadas
 * de início e fim (art. 2º, VII) e recusam que o requerente lavre a
 * decisão (art. 13). Ver `supabase/migrations/20260921120000_11_*`.
 */

import type { LngLat } from './geo';

export interface ScheduleStage {
  /** Etapa do cronograma físico exigido pelo art. 12. */
  stage: string;
  starts_on: string;
  ends_on: string;
}

export interface LicenseDraft {
  interventionId: string | null;
  licenseId: string | null;

  // 1. Identificação e partes (art. 10, art. 11)
  typeId: string;
  description: string;
  purpose: string;
  concessionaireId: string | null;
  /** CNPJ como digitado. */
  concessionaireLabel: string;
  /** Razão social, quando o CNPJ resolveu numa empresa habilitada. */
  concessionaireName: string;
  subcontractorId: string | null;
  subcontractorLabel: string;
  subcontractorName: string;
  technicalResponsibleId: string | null;

  // 2. Localização e trecho (art. 2º, VII; art. 27)
  geometry: GeoJSON.Geometry | null;
  address: string;
  street: string;
  district: string;
  segmentFrom: string;
  segmentTo: string;
  segmentStart: LngLat | null;
  segmentEnd: LngLat | null;
  lengthM: string;

  // 3. Escopo e método
  scope: string;
  constructionMethod: string;
  affectedInfrastructure: string;

  // 4. Cronograma (art. 12, art. 13, pú)
  startsOn: string;
  endsOn: string;
  schedule: ScheduleStage[];
}

export const emptyDraft = (): LicenseDraft => ({
  interventionId: null,
  licenseId: null,
  typeId: '',
  purpose: '',
  concessionaireId: null,
  concessionaireLabel: '',
  concessionaireName: '',
  subcontractorId: null,
  subcontractorLabel: '',
  subcontractorName: '',
  technicalResponsibleId: null,
  geometry: null,
  address: '',
  street: '',
  district: '',
  segmentFrom: '',
  segmentTo: '',
  segmentStart: null,
  segmentEnd: null,
  lengthM: '',
  description: '',
  scope: '',
  constructionMethod: '',
  affectedInfrastructure: '',
  startsOn: '',
  endsOn: '',
  schedule: [],
});

// ---------------------------------------------------------------------
// Documentos do art. 12
// ---------------------------------------------------------------------

export type LicenseDocumentKind =
  | 'planta_locacao' | 'cronograma_fisico' | 'art_rrt' | 'geoespacial' | 'complementar';

export interface DocumentSpec {
  kind: LicenseDocumentKind;
  label: string;
  hint: string;
  required: boolean;
  legalBasis: string | null;
}

/**
 * Os três primeiros são exigência expressa do art. 12 e o banco recusa
 * protocolo sem eles. Os dois últimos são facultativos e não têm
 * fundamento normativo próprio — por isso `legalBasis` é nulo, e não um
 * artigo inventado para parecer completo.
 */
export const LICENSE_DOCUMENTS: DocumentSpec[] = [
  {
    kind: 'planta_locacao',
    label: 'Planta de locação',
    hint: 'Peça gráfica que localiza a obra no logradouro.',
    required: true,
    legalBasis: 'Art. 12',
  },
  {
    kind: 'cronograma_fisico',
    label: 'Cronograma físico',
    hint: 'Define a vigência da licença, se deferida (art. 13, parágrafo único).',
    required: true,
    legalBasis: 'Art. 12',
  },
  {
    kind: 'art_rrt',
    label: 'ART ou RRT específica',
    hint: 'Específica desta obra — não se confunde com a ART de cargo ou função do CADEX.',
    required: true,
    legalBasis: 'Art. 12',
  },
  {
    kind: 'geoespacial',
    label: 'Arquivo geoespacial',
    hint: 'GeoJSON ou KML do traçado. Facultativo.',
    required: false,
    legalBasis: null,
  },
  {
    kind: 'complementar',
    label: 'Documento complementar',
    hint: 'Qualquer peça adicional que o requerente julgue necessária.',
    required: false,
    legalBasis: null,
  },
];

export const REQUIRED_DOCUMENT_KINDS = LICENSE_DOCUMENTS
  .filter((d) => d.required)
  .map((d) => d.kind);

// ---------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------

export interface StepSpec {
  id: number;
  title: string;
  legend: string;
}

export const STEPS: StepSpec[] = [
  { id: 1, title: 'Identificação',        legend: 'Tipo de obra, objeto e partes envolvidas (arts. 10 e 11)' },
  { id: 2, title: 'Localização',          legend: 'Geometria e trecho por coordenadas (art. 2º, VII)' },
  { id: 3, title: 'Escopo',               legend: 'Objeto, método construtivo e infraestrutura afetada' },
  { id: 4, title: 'Cronograma',           legend: 'Prazo da obra — define a vigência (art. 13, pú)' },
  { id: 5, title: 'Documentos',           legend: 'Instrução obrigatória do pedido (art. 12)' },
  { id: 6, title: 'Revisão e protocolo',  legend: 'Conferência e protocolo (art. 13)' },
];

// ---------------------------------------------------------------------
// Validação por etapa
// ---------------------------------------------------------------------

export type Problems = Record<string, string>;

const isBlank = (s: string): boolean => !s || s.trim().length === 0;

export function validateStep(
  step: number,
  d: LicenseDraft,
  uploaded: Set<string> = new Set(),
): Problems {
  const p: Problems = {};

  if (step === 1) {
    if (isBlank(d.typeId)) p.typeId = 'Selecione o tipo de obra previsto no art. 10.';
    if (isBlank(d.description)) p.description = 'Descreva sumariamente a intervenção.';
    if (isBlank(d.purpose)) p.purpose = 'Informe a finalidade do pedido.';
    if (d.concessionaireLabel && !d.concessionaireId) {
      p.concessionaireId = 'CNPJ informado não corresponde a empresa com CADEX ativo.';
    }
    if (d.subcontractorLabel && !d.subcontractorId) {
      p.subcontractorId = 'CNPJ informado não corresponde a empresa com CADEX ativo.';
    }
  }

  if (step === 2) {
    if (!d.geometry) p.geometry = 'Desenhe ou importe a geometria da intervenção.';
    if (isBlank(d.street)) p.street = 'Informe o logradouro.';
    if (isBlank(d.district)) p.district = 'Informe o bairro.';

    // Art. 2º, VII — descrever o trecho obriga a delimitá-lo por coordenadas.
    const hasSegmentText = !isBlank(d.segmentFrom) || !isBlank(d.segmentTo);
    if (hasSegmentText && (!d.segmentStart || !d.segmentEnd)) {
      p.segment =
        'O trecho é delimitado por coordenadas de início e de fim (art. 2º, VII). '
        + 'Marque os dois pontos no mapa ou apague a descrição do trecho.';
    }
    if (d.lengthM && !(Number(d.lengthM) > 0)) {
      p.lengthM = 'A extensão deve ser um número positivo, em metros.';
    }
  }

  if (step === 3) {
    if (isBlank(d.scope)) p.scope = 'Informe o escopo — ele é publicado na placa do canteiro (art. 14).';
    if (isBlank(d.constructionMethod)) p.constructionMethod = 'Informe o método construtivo.';
  }

  if (step === 4) {
    if (isBlank(d.startsOn)) p.startsOn = 'Informe a data prevista de início.';
    if (isBlank(d.endsOn)) p.endsOn = 'Informe a data prevista de encerramento — ela é publicada (art. 14).';
    if (!isBlank(d.startsOn) && !isBlank(d.endsOn) && d.endsOn < d.startsOn) {
      p.endsOn = 'O encerramento não pode anteceder o início.';
    }
    d.schedule.forEach((s, i) => {
      if (isBlank(s.stage)) p[`schedule.${i}.stage`] = 'Descreva a etapa.';
      if (!isBlank(s.starts_on) && !isBlank(s.ends_on) && s.ends_on < s.starts_on) {
        p[`schedule.${i}.ends_on`] = 'Fim anterior ao início.';
      }
    });
  }

  if (step === 5) {
    for (const spec of LICENSE_DOCUMENTS) {
      if (spec.required && !uploaded.has(spec.kind)) {
        p[spec.kind] = `${spec.label} é exigida pelo art. 12.`;
      }
    }
  }

  return p;
}

/** Todas as etapas anteriores ao protocolo, para a revisão da etapa 6. */
export function validateAll(d: LicenseDraft, uploaded: Set<string>): Problems {
  return [1, 2, 3, 4, 5].reduce<Problems>(
    (acc, step) => ({ ...acc, ...validateStep(step, d, uploaded) }),
    {},
  );
}

export const hasProblems = (p: Problems): boolean => Object.keys(p).length > 0;
