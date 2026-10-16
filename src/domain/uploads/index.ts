import "server-only";

// Public API of the uploads module. uploadsSystemService skips user
// authorization: only workers and other domain modules may use it.
export { uploadsService, uploadsSystemService } from "./service";
