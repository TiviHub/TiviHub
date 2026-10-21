import type { StorageOp, StoreName, StoreValues } from "./backend";
import type { SqliteBackend } from "./sqliteBackend";

// Xtream stream URLs carry the account's username and password as path segments. SQLite keeps them as
// placeholders and this wrapper fills them back in from the encrypted playlist record, so the
// database files never contain the login.
const URL_STORES: readonly StoreName[] = ["channels", "movies", "episodes", "favorites", "library"];
const PLACEHOLDER = "/{username}/{password}/";

type Credentials = { username: string; password: string };
type UrlRecord = { playlistId: string; streamUrl?: string };

const segment = ({ username, password }: Credentials) =>
  `/${encodeURIComponent(username)}/${encodeURIComponent(password)}/`;

export function redactUrl(url: string, credentials: Credentials | null): string {
  return credentials?.username && credentials.password ? url.replace(segment(credentials), () => PLACEHOLDER) : url;
}

export function hydrateUrl(url: string, credentials: Credentials | null): string {
  return credentials ? url.replace(PLACEHOLDER, () => segment(credentials)) : url;
}

export function withoutCredentialUrls(inner: SqliteBackend): SqliteBackend {
  let cache = new Map<string, Promise<Credentials | null>>();

  async function open(stored: StoreValues["playlists"] | undefined): Promise<Credentials | null> {
    if (stored?.type !== "XTREAM" || !stored.privateData) return null;
    try {
      const { username, password } = JSON.parse(await inner.decrypt(stored.privateData)) as Credentials;
      return { username, password };
    } catch {
      return null; // undecryptable sources are flagged for re-entry elsewhere
    }
  }

  function credentials(id: string, pending?: Map<string, Credentials | null>): Promise<Credentials | null> {
    if (pending?.has(id)) return Promise.resolve(pending.get(id)!);
    let found = cache.get(id);
    if (!found) {
      found = inner.get("playlists", id).then(open);
      cache.set(id, found);
    }
    return found;
  }

  async function lookup(ids: Iterable<string>, pending?: Map<string, Credentials | null>) {
    const unique = [...new Set(ids)];
    return new Map(await Promise.all(unique.map(async (id) => [id, await credentials(id, pending)] as const)));
  }

  async function convert<T>(records: T[], change: (url: string, credentials: Credentials | null) => string, pending?: Map<string, Credentials | null>): Promise<T[]> {
    const urlRecords = records as unknown as UrlRecord[];
    const owners = await lookup(urlRecords.filter((record) => record.streamUrl).map((record) => record.playlistId), pending);
    return urlRecords.map((record) => {
      const owner = owners.get(record.playlistId);
      return record.streamUrl && owner ? { ...record, streamUrl: change(record.streamUrl, owner) } : record;
    }) as unknown as T[];
  }

  const hydrate = <T>(store: StoreName, records: T[]) =>
    URL_STORES.includes(store) ? convert(records, hydrateUrl) : Promise.resolve(records);

  return {
    ...inner,
    get: async (store, key) => {
      const record = await inner.get(store, key);
      return record && URL_STORES.includes(store) ? (await hydrate(store, [record]))[0] : record;
    },
    getAll: async (store) => hydrate(store, await inner.getAll(store)),
    getAllByIndex: async (store, index, value) => hydrate(store, await inner.getAllByIndex(store, index, value)),
    async tx(ops: StorageOp[]) {
      // A transaction can add a playlist together with its catalog rows (restoring a backup).
      const pending = new Map<string, Credentials | null>();
      for (const op of ops) {
        if (op.op === "put" && op.store === "playlists") {
          const playlist = op.record as StoreValues["playlists"];
          pending.set(playlist.id, await open(playlist));
        }
      }
      const isUrlPut = (op: StorageOp): op is Extract<StorageOp, { op: "put" }> =>
        op.op === "put" && URL_STORES.includes(op.store);
      const records = await convert(ops.filter(isUrlPut).map((op) => op.record), redactUrl, pending);
      let next = 0;
      const converted = ops.map((op) => (isUrlPut(op) ? { ...op, record: records[next++] } : op));
      cache = new Map();
      await inner.tx(converted);
      cache = new Map();
    },
    async saveCatalog(write) {
      const pending = new Map<string, Credentials | null>();
      if (write.sourceUpdate) pending.set(write.playlistId, await open(write.sourceUpdate));
      await inner.saveCatalog({
        ...write,
        channels: await convert(write.channels, redactUrl, pending),
        movies: await convert(write.movies, redactUrl, pending),
        episodes: write.episodes && (await convert(write.episodes, redactUrl, pending)),
      });
      cache = new Map();
    },
    async deletePlaylist(id, onProgress) {
      await inner.deletePlaylist(id, onProgress);
      cache = new Map();
    },
    async wipe() {
      await inner.wipe();
      cache = new Map();
    },
  };
}
