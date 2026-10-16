import { timingSafeEqual } from "node:crypto";

export function internalRequestAuthorized(
  request: Request,
  header: string,
  expected: string | undefined,
) {
  if (!expected) {
    return false;
  }
  const actualBytes = Buffer.from(request.headers.get(header) || "");
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
