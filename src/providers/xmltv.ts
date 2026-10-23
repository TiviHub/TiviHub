import type { EpgProgram } from "../types";
import { recordDiagnosticFailure } from "../diagnosticLog";
import { validateHttpUrl } from "./m3u";
import { readResponseText } from "./http";
import { providerFetch } from "./transport";

const MAX_XML_BYTES = 50 * 1024 * 1024;

export async function fetchXmltv(url: string, source: string, userAgent?: string): Promise<EpgProgram[]> {
  const safeUrl = validateHttpUrl(url, "EPG URL");
  let response: Response;
  try {
    response = await providerFetch(safeUrl, { headers: { Accept: "application/xml, text/xml, */*" } }, userAgent);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    recordDiagnosticFailure("xmltv-guide", "network");
    throw new Error(
      "The EPG could not be fetched by TiviHub. The provider may block cross-origin access (CORS).",
      { cause },
    );
  }
  if (!response.ok) {
    recordDiagnosticFailure("xmltv-guide", "http", response.status);
    throw new Error(`EPG request failed with HTTP ${response.status}.`);
  }
  try {
    const xml = await readResponseText(response, MAX_XML_BYTES, "EPG file");
    return parseXmltv(xml, source);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    recordDiagnosticFailure("xmltv-guide", "invalid-response");
    throw cause;
  }
}

export function parseXmltv(xml: string, source: string, now = Date.now()): EpgProgram[] {
  if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) {
    throw new Error("EPG file is larger than the supported 50 MB limit.");
  }
  if (/<!ENTITY\b/i.test(xml)) throw new Error("EPG files with custom XML entities are not supported.");

  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The EPG file contains invalid XML.");

  const startLimit = now - 2 * 60 * 60 * 1000;
  const endLimit = now + 24 * 60 * 60 * 1000;
  return Array.from(document.getElementsByTagName("programme")).flatMap((node, index) => {
    const channelId = node.getAttribute("channel")?.trim();
    const startMillis = parseXmltvDate(node.getAttribute("start") ?? "");
    const endMillis = parseXmltvDate(node.getAttribute("stop") ?? "");
    const title = node.getElementsByTagName("title").item(0)?.textContent?.trim();
    if (
      !channelId ||
      startMillis === null ||
      endMillis === null ||
      startMillis >= endMillis ||
      startMillis >= endLimit ||
      endMillis <= startLimit ||
      !title
    ) {
      return [];
    }
    const synopsis = node.getElementsByTagName("desc").item(0)?.textContent?.trim();
    return [{
      id: `${source}:${channelId}:${startMillis}:${index}`,
      channelId,
      title,
      synopsis: synopsis || undefined,
      startMillis,
      endMillis,
      source,
    }];
  });
}

export function parseXmltvDate(value: string): number | null {
  const match = /^(\d{14})(?:\s*([+-])(\d{2})(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, digits, sign, hours, minutes] = match;
  if (Number(hours ?? 0) > 23 || Number(minutes ?? 0) > 59) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const second = Number(digits.slice(12, 14));
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) return null;

  const offsetMinutes = hours && minutes
    ? (Number(hours) * 60 + Number(minutes)) * (sign === "+" ? 1 : -1)
    : 0;
  return utc - offsetMinutes * 60_000;
}
