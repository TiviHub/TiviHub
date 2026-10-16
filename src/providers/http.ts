export async function readResponseText(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error(`${label} is larger than the supported ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`);
  }

  if (!response.body) throw new Error(`${label} response did not contain a readable body.`);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} is larger than the supported ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

export function validateHttpsUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:" || !url.hostname) {
    throw new Error(`${label} must use HTTPS.`);
  }
  return url.toString();
}
