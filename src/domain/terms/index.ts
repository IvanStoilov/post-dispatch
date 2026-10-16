import "server-only";

// Public API of the terms module. termsSystemService is for auth and other
// domain modules only.
export { termsService, termsSystemService } from "./service";
