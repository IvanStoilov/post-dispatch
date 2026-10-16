import { termsService } from "../../src/domain/terms";
export function acceptedSignup<T>(input: T) {
  const terms = termsService.current();
  return {
    ...(input as T & object),
    termsAccepted: true as const,
    termsVersion: terms.version,
    termsHash: terms.hash,
  };
}
