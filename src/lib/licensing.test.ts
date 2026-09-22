import { describe, expect, it } from 'vitest';
import {
  LICENSE_DOCUMENTS, REQUIRED_DOCUMENT_KINDS, STEPS,
  emptyDraft, hasProblems, validateAll, validateStep, type LicenseDraft,
} from './licensing';

const filled = (over: Partial<LicenseDraft> = {}): LicenseDraft => ({
  ...emptyDraft(),
  typeId: 'tipo-1',
  description: 'Abertura de vala para lançamento de rede',
  purpose: 'Expansão de rede de telecomunicações',
  geometry: { type: 'LineString', coordinates: [[-43.10, -22.88], [-43.11, -22.89]] },
  street: 'Av. Ernani do Amaral Peixoto',
  district: 'Centro',
  scope: 'Vala de 200 m com reposição de pavimento',
  constructionMethod: 'Céu aberto',
  startsOn: '2026-10-01',
  endsOn: '2026-11-15',
  ...over,
});

const allDocs = new Set(REQUIRED_DOCUMENT_KINDS);

describe('etapas', () => {
  it('são exatamente seis, numeradas em ordem', () => {
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('etapa 1 — identificação (arts. 10 e 11)', () => {
  it('exige tipo de obra, descrição e finalidade', () => {
    const p = validateStep(1, emptyDraft());
    expect(p.typeId).toBeDefined();
    expect(p.description).toBeDefined();
    expect(p.purpose).toBeDefined();
  });

  it('recusa CNPJ que não resolveu em empresa habilitada', () => {
    const p = validateStep(1, filled({ concessionaireLabel: '05.570.714/0001-59', concessionaireId: null }));
    expect(p.concessionaireId).toMatch(/CADEX ativo/);
  });

  it('aceita quando o CNPJ resolveu', () => {
    const p = validateStep(1, filled({
      concessionaireLabel: '05.570.714/0001-59',
      concessionaireId: '11111111-1111-4111-8111-111111111111',
    }));
    expect(hasProblems(p)).toBe(false);
  });

  it('não exige concessionária nem subcontratada', () => {
    expect(hasProblems(validateStep(1, filled()))).toBe(false);
  });
});

describe('etapa 2 — art. 2º, VII: trecho é delimitado por coordenadas', () => {
  it('exige geometria', () => {
    expect(validateStep(2, filled({ geometry: null })).geometry).toBeDefined();
  });

  it('descrever o trecho sem as duas coordenadas é recusado', () => {
    const p = validateStep(2, filled({ segmentFrom: 'nº 100', segmentTo: 'nº 300' }));
    expect(p.segment).toMatch(/coordenadas de início e de fim/);
  });

  it('uma coordenada só não basta', () => {
    const p = validateStep(2, filled({
      segmentFrom: 'nº 100',
      segmentStart: { lng: -43.10, lat: -22.88 },
    }));
    expect(p.segment).toBeDefined();
  });

  it('com as duas coordenadas, passa', () => {
    const p = validateStep(2, filled({
      segmentFrom: 'nº 100', segmentTo: 'nº 300',
      segmentStart: { lng: -43.10, lat: -22.88 },
      segmentEnd: { lng: -43.11, lat: -22.89 },
    }));
    expect(hasProblems(p)).toBe(false);
  });

  it('sem descrição de trecho, não cobra coordenadas', () => {
    expect(hasProblems(validateStep(2, filled()))).toBe(false);
  });

  it('recusa extensão não positiva', () => {
    expect(validateStep(2, filled({ lengthM: '0' })).lengthM).toBeDefined();
    expect(validateStep(2, filled({ lengthM: '-5' })).lengthM).toBeDefined();
    expect(validateStep(2, filled({ lengthM: '200' })).lengthM).toBeUndefined();
  });
});

describe('etapa 4 — cronograma (art. 13, parágrafo único)', () => {
  it('exige início e encerramento', () => {
    const p = validateStep(4, filled({ startsOn: '', endsOn: '' }));
    expect(p.startsOn).toBeDefined();
    expect(p.endsOn).toBeDefined();
  });

  it('recusa encerramento anterior ao início', () => {
    const p = validateStep(4, filled({ startsOn: '2026-11-15', endsOn: '2026-10-01' }));
    expect(p.endsOn).toMatch(/anteceder/);
  });

  it('valida cada etapa detalhada', () => {
    const p = validateStep(4, filled({
      schedule: [{ stage: '', starts_on: '2026-10-01', ends_on: '2026-09-01' }],
    }));
    expect(p['schedule.0.stage']).toBeDefined();
    expect(p['schedule.0.ends_on']).toBeDefined();
  });
});

describe('etapa 5 — instrução do art. 12', () => {
  it('cobra exatamente os três documentos do artigo', () => {
    expect(REQUIRED_DOCUMENT_KINDS).toEqual(['planta_locacao', 'cronograma_fisico', 'art_rrt']);
  });

  it('acusa cada documento faltante', () => {
    const p = validateStep(5, filled(), new Set());
    expect(Object.keys(p).sort()).toEqual(['art_rrt', 'cronograma_fisico', 'planta_locacao']);
  });

  it('a falta de um só já impede', () => {
    const p = validateStep(5, filled(), new Set(['planta_locacao', 'cronograma_fisico']));
    expect(p.art_rrt).toMatch(/art. 12/);
  });

  it('com os três, passa — os facultativos não são cobrados', () => {
    expect(hasProblems(validateStep(5, filled(), allDocs))).toBe(false);
  });

  it('documento facultativo não carrega fundamento normativo inventado', () => {
    for (const spec of LICENSE_DOCUMENTS) {
      if (!spec.required) expect(spec.legalBasis).toBeNull();
      else expect(spec.legalBasis).toBe('Art. 12');
    }
  });
});

describe('etapa 6 — revisão acumula as anteriores', () => {
  it('um pedido completo pode ser protocolado', () => {
    expect(hasProblems(validateAll(filled(), allDocs))).toBe(false);
  });

  it('um pedido vazio acusa as pendências de todas as etapas', () => {
    const p = validateAll(emptyDraft(), new Set());
    expect(p.typeId).toBeDefined();
    expect(p.geometry).toBeDefined();
    expect(p.scope).toBeDefined();
    expect(p.startsOn).toBeDefined();
    expect(p.planta_locacao).toBeDefined();
  });
});
