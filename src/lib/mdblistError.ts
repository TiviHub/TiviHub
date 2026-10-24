export type MdblistErrorKind =
  | "missing-key"
  | "auth"
  | "rate-limited"
  | "server"
  | "network"
  | "invalid-response";

/** Error messages are user-safe: they never include the API key or request URL. */
export class MdblistError extends Error {
  constructor(readonly kind: MdblistErrorKind, message: string, readonly status?: number, readonly retryAt?: number) {
    super(message);
    this.name = "MdblistError";
  }
}
