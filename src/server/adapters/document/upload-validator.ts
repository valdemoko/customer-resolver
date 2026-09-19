/**
 * Upload validator adapter (Fase 5).
 *
 * Wraps the pure validation logic from core/document/validation.ts
 * into the UploadValidatorPort interface for DI.
 */
import type {
  UploadValidatorPort,
  ValidateUploadInput,
  ValidateUploadResult,
} from "@core/document/ports";
import { validateUpload } from "@core/document/validation";
import type { UploadConfig } from "@core/document/types";
import { DEFAULT_UPLOAD_CONFIG } from "@core/document/types";

export class UploadValidatorAdapter implements UploadValidatorPort {
  constructor(private readonly config: UploadConfig = DEFAULT_UPLOAD_CONFIG) {}

  validate(input: ValidateUploadInput): ValidateUploadResult {
    return validateUpload(input, this.config);
  }
}
