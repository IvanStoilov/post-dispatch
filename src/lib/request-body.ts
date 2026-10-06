export async function imageDraftBody(req: Request) {
  const body = await readBody(req, 12 * 1024 * 1024, "Draft request");
  return JSON.parse(body.toString("utf8"));
}
export async function readBody(req: Request, limit: number, label: string) {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new Error(`${label} is too large`);
  const reader = req.body?.getReader();
  if (!reader) throw new Error(`Missing ${label.toLowerCase()} body`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error(`${label} is too large`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
