import "fake-indexeddb/auto";
import * as database from "../storage/database";
import { describeStorageContract } from "./storageContract";

describeStorageContract("local IndexedDB storage", async () => ({
  database,
  incrementalDeleteProgress: true,
  rawPlaylist: (id) =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open("tivihub-web");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const request = open.result.transaction("playlists").objectStore("playlists").get(id);
        request.onsuccess = () => {
          open.result.close();
          resolve(request.result as Record<string, unknown>);
        };
        request.onerror = () => reject(request.error);
      };
    }),
}));
