// poodleOS — OCR provider adapter (universal fallback)
//
// Works for ANY vet with zero integration: the owner photographs their vaccine
// certificate, we OCR the dates. No clinic-release consent needed (owner already
// holds the document). Records are source='ocr', verified=false until a human or
// a trusted source confirms — they still satisfy the soft-flag workflow.
//
// The actual OCR call is pluggable (AWS Textract has a published vaccination
// reference solution; Google Document AI / Azure are equivalents). Inject an
// `OcrEngine` so the provider stays vendor-neutral and testable.

import {
  type FetchInput,
  type PetVaccineStatus,
  type VaccinationRecord,
  type VaccineRecordProvider,
  ProviderNotConfiguredError,
} from '../types';

/** Raw extraction from a document image — implemented by Textract/DocumentAI/etc. */
export interface OcrEngine {
  extract(documentUrl: string): Promise<VaccinationRecord[]>;
}

export class OcrProvider implements VaccineRecordProvider {
  readonly name = 'ocr' as const;
  readonly requiresConsent = false;

  constructor(private engine?: OcrEngine) {}

  isConfigured(): boolean {
    return Boolean(this.engine);
  }

  async fetchRecords(input: FetchInput): Promise<PetVaccineStatus> {
    if (!this.engine) throw new ProviderNotConfiguredError(this.name);
    const documentUrl = input.hints?.documentUrl as string | undefined;
    if (!documentUrl) {
      throw new Error('OcrProvider requires hints.documentUrl (the uploaded certificate image)');
    }
    const records = (await this.engine.extract(documentUrl)).map((r) => ({
      ...r,
      source: 'ocr' as const,
      verified: false,
      rawDocumentUrl: documentUrl,
    }));
    return {
      petId: input.petId,
      records,
      retrievedAt: new Date().toISOString(),
      provider: this.name,
    };
  }
}
