/** Formats a moment as `YYYY-MM-DD:HH-mm` in the given IANA time zone, the way Xtream archive URLs write it. */
export function formatServerTime(millis: number, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", { ...options, timeZone });
  } catch {
    // An unknown time zone name from the server falls back to this device's time zone.
    formatter = new Intl.DateTimeFormat("en-CA", options);
  }
  const part = (type: string) => formatter.formatToParts(new Date(millis)).find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}:${part("hour")}-${part("minute")}`;
}
