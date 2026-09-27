/**
 * Shared Ajv singleton for composable-document JSON Schema validation.
 *
 * Ajv validates stored schemas (`inputSchema`/`styleSchema` from the component
 * registry) and AI-emitted contracts at runtime — the case Zod and
 * class-validator cannot cover because the schemas are dynamic data, not
 * compile-time types. DTO boundaries keep using class-validator.
 */
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

let ajv: Ajv | null = null;

export function getAjv(): Ajv {
  if (!ajv) {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  }
  return ajv;
}

export function compileSchema(
  schema: Record<string, unknown>,
): ValidateFunction {
  return getAjv().compile(schema);
}

const validatorCache = new WeakMap<Record<string, unknown>, ValidateFunction>();

/** Compile once per schema object; reused across validations. */
export function validatorFor(
  schema: Record<string, unknown>,
): ValidateFunction {
  let v = validatorCache.get(schema);
  if (!v) {
    v = compileSchema(schema);
    validatorCache.set(schema, v);
  }
  return v;
}

/**
 * Format Ajv errors as `inputs.<path> <message>` strings so results stay
 * actionable (which field, what is wrong). Missing required properties report
 * the missing key as the path.
 */
export function formatAjvErrors(
  validate: ValidateFunction,
  prefix = 'inputs',
): string[] {
  const errors: ErrorObject[] = validate.errors ?? [];
  return errors.map((e) => {
    let path = e.instancePath.replace(/\//g, '.');
    if (e.keyword === 'required' && e.params && typeof e.params === 'object') {
      const missing = (e.params as { missingProperty?: string })
        .missingProperty;
      if (missing) path = `${path}.${missing}`;
    }
    const at = path ? `${prefix}${path}` : prefix;
    return `${at} ${e.message ?? 'is invalid'}`;
  });
}
