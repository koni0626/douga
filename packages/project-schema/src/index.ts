import Ajv2020 from "ajv/dist/2020";

import projectSchema from "../schema/project-v1.schema.json";
import type { ProjectDocument } from "./generated/project-v1";

export type { ProjectDocument } from "./generated/project-v1";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile<ProjectDocument>(projectSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateProjectDocument(value: unknown): ValidationResult {
  if (validate(value)) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: (validate.errors ?? []).map(
      (error) =>
        `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
    ),
  };
}

export { projectSchema };
