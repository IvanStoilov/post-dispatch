import "server-only";

// Public API of the assistants module. assistantsSystemService skips user
// authorization: only workers and other domain modules may use it.
export { assistantsService, assistantsSystemService } from "./service";
