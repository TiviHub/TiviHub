import { t } from "../lib/i18n";

export async function readResponseText(
  response: Response,
  maxBytes: number | undefined,
  label: string,
): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (maxBytes !== undefined && Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error(t("http.tooLarge", { label, mb: Math.floor(maxBytes / (1024 * 1024)) }));
  }

  if (!response.body) throw new Error(t("http.noBody", { label }));

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (maxBytes !== undefined && total > maxBytes) {
        await reader.cancel();
        throw new Error(t("http.tooLarge", { label, mb: Math.floor(maxBytes / (1024 * 1024)) }));
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
    throw new Error(t("http.invalidUrl", { label }));
  }
  if (url.protocol !== "https:" || !url.hostname) {
    throw new Error(t("http.httpsOnly", { label }));
  }
  return url.toString();
}
