export async function imageDraftBody(req: Request) {
  const limit = 12 * 1024 * 1024;
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new Error("Draft request is too large");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing draft request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Draft request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
