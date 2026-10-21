// Local Xtream-compatible server for the baseline harness. Responses are streamed from the
// seeded generators, so L and XL never sit in memory as one string.
import { createServer } from "node:http";
import {
  categories, jsonArrayChunks, liveStreams, seriesInfo, seriesList, sizeFor, userInfo, vodStreams,
} from "./dataset.mjs";

export const MOCK_USERNAME = "sentinel-user";
export const MOCK_PASSWORD = "sentinel-pass";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function sendJson(response, value) {
  response.writeHead(200, { ...CORS, "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function sendStream(response, chunks) {
  response.writeHead(200, { ...CORS, "Content-Type": "application/json" });
  for (const chunk of chunks) {
    if (!response.write(chunk)) await new Promise((done) => response.once("drain", done));
  }
  response.end();
}

/** Starts the server on `port` (0 picks a free one). Returns { url, port, close }. */
export async function startMockXtream({ size = "S", port = 0 } = {}) {
  const counts = sizeFor(size);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET" });
      response.end();
      return;
    }
    if (url.pathname !== "/player_api.php") {
      response.writeHead(404, CORS);
      response.end();
      return;
    }
    if (url.searchParams.get("username") !== MOCK_USERNAME || url.searchParams.get("password") !== MOCK_PASSWORD) {
      response.writeHead(401, CORS);
      response.end();
      return;
    }
    const action = url.searchParams.get("action");
    if (action === null) return sendJson(response, userInfo(MOCK_USERNAME));
    if (action === "get_live_categories") return sendJson(response, categories("live"));
    if (action === "get_vod_categories") return sendJson(response, categories("vod"));
    if (action === "get_series_categories") return sendJson(response, categories("series"));
    if (action === "get_live_streams") return void sendStream(response, jsonArrayChunks(liveStreams(counts.channels)));
    if (action === "get_vod_streams") return void sendStream(response, jsonArrayChunks(vodStreams(counts.movies)));
    if (action === "get_series") return void sendStream(response, jsonArrayChunks(seriesList(counts.series)));
    if (action === "get_series_info") return sendJson(response, seriesInfo(Number(url.searchParams.get("series_id"))));
    response.writeHead(400, CORS);
    response.end();
  });
  await new Promise((done) => server.listen(port, "127.0.0.1", done));
  const actualPort = server.address().port;
  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    close: () => new Promise((done) => {
      server.closeAllConnections();
      server.close(done);
    }),
  };
}

if (process.argv[1]?.endsWith("mockXtream.mjs")) {
  const sizeArg = process.argv.indexOf("--size");
  const portArg = process.argv.indexOf("--port");
  const mock = await startMockXtream({
    size: sizeArg >= 0 ? process.argv[sizeArg + 1] : "S",
    port: portArg >= 0 ? Number(process.argv[portArg + 1]) : 8765,
  });
  console.log(`Mock Xtream on ${mock.url} (user ${MOCK_USERNAME}, password ${MOCK_PASSWORD}). Ctrl+C to stop.`);
}
