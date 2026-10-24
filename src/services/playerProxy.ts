import type { ShakaPlayer } from "../lib/playbackMedia";
import { proxiedUrl } from "../providers/transport";

/** Sends a Shaka player's provider requests through the loopback proxy (see the `playback` skill). */
export function routePlayerThroughProxy(player: ShakaPlayer, base: string): void {
  // Manifest (0), segment (1), timing (4) and key (6) requests go to the provider; licence requests do not.
  const engine = player.getNetworkingEngine();
  engine?.registerRequestFilter((type, request) => {
    if ([0, 1, 4, 6].includes(type)) request.uris = request.uris.map((uri) => proxiedUrl(base, uri));
  });
  // Relative segment addresses in a playlist resolve against the response address, so give back the real one.
  engine?.registerResponseFilter((_type, response) => {
    if (!response.uri.startsWith(base)) return;
    response.uri = response.headers["x-final-url"] ?? new URL(response.uri).searchParams.get("u") ?? response.uri;
  });
}
