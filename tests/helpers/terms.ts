import { currentTerms } from "../../src/lib/terms";
export function acceptedSignup<T>(input: T) {
  const terms = currentTerms();
  return {
    ...(input as T & object),
    termsAccepted: true,
    termsVersion: terms.version,
    termsHash: terms.hash,
  };
}
