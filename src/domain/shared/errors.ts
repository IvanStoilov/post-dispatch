import "server-only";

// 502: a social network did not confirm an action, so its outcome is unknown.
export type UserFacingStatus = 400 | 401 | 403 | 404 | 409 | 429 | 502;

// A failure whose message is safe to show users, with the HTTP status it
// maps to. API layers translate it; anything else is treated as a 500.
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly status: UserFacingStatus,
  ) {
    super(message);
  }
}
