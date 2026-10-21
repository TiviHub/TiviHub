// Deterministic Xtream-shaped catalogs for the baseline harness. Same size and seed, same bytes.
export const SIZES = {
  S: { channels: 200, movies: 100, series: 50 },
  M: { channels: 5_000, movies: 20_000, series: 4_000 },
  L: { channels: 54_000, movies: 214_000, series: 46_000 },
  XL: { channels: 200_000, movies: 200_000, series: 50_000 },
};

const WORDS = [
  "Night", "River", "Silent", "Golden", "Last", "Wild", "Broken", "Hidden", "Northern", "Crimson",
  "Paper", "Iron", "Summer", "Shadow", "Lost", "Bright", "Winter", "Empire", "Garden", "Storm",
];
const CATEGORY_COUNTS = { live: 40, vod: 60, series: 40 };

// mulberry32: small, fast, and identical on every platform.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length)];
const title = (random, index) => `${pick(random, WORDS)} ${pick(random, WORDS)} ${index}`;

export function categories(kind) {
  const prefix = { live: "Live", vod: "Movies", series: "Series" }[kind];
  return Array.from({ length: CATEGORY_COUNTS[kind] }, (_, index) => ({
    category_id: String(index + 1),
    category_name: `${prefix} Category ${index + 1}`,
    parent_id: 0,
  }));
}

export function* liveStreams(count, seed = 1) {
  const random = seededRandom(seed);
  for (let index = 0; index < count; index += 1) {
    yield {
      num: index + 1,
      name: `Channel ${title(random, index)}`,
      stream_type: "live",
      stream_id: index + 1,
      stream_icon: `http://127.0.0.1/icons/live/${index + 1}.png`,
      epg_channel_id: `channel${index + 1}.example`,
      added: String(1_600_000_000 + Math.floor(random() * 100_000_000)),
      category_id: String(1 + Math.floor(random() * CATEGORY_COUNTS.live)),
      custom_sid: "",
      tv_archive: 0,
      direct_source: "",
    };
  }
}

export function* vodStreams(count, seed = 2) {
  const random = seededRandom(seed);
  for (let index = 0; index < count; index += 1) {
    const year = 1950 + Math.floor(random() * 76);
    const rating = (random() * 9 + 1).toFixed(1);
    yield {
      num: index + 1,
      name: `${title(random, index)} (${year})`,
      stream_type: "movie",
      stream_id: index + 1,
      stream_icon: `http://127.0.0.1/icons/vod/${index + 1}.jpg`,
      rating,
      rating_5based: Number(rating) / 2,
      added: String(1_600_000_000 + Math.floor(random() * 100_000_000)),
      category_id: String(1 + Math.floor(random() * CATEGORY_COUNTS.vod)),
      container_extension: random() < 0.7 ? "mp4" : "mkv",
      plot: `A story about ${pick(random, WORDS).toLowerCase()} and ${pick(random, WORDS).toLowerCase()}, generated for measurement.`,
      releasedate: `${year}-0${1 + Math.floor(random() * 9)}-15`,
      tmdb: String(100_000 + index),
    };
  }
}

export function* seriesList(count, seed = 3) {
  const random = seededRandom(seed);
  for (let index = 0; index < count; index += 1) {
    const year = 1960 + Math.floor(random() * 66);
    const rating = (random() * 9 + 1).toFixed(1);
    yield {
      num: index + 1,
      name: `${title(random, index)} (${year})`,
      series_id: index + 1,
      cover: `http://127.0.0.1/icons/series/${index + 1}.jpg`,
      plot: `A series about ${pick(random, WORDS).toLowerCase()}, generated for measurement.`,
      rating,
      rating_5based: Number(rating) / 2,
      last_modified: String(1_600_000_000 + Math.floor(random() * 100_000_000)),
      category_id: String(1 + Math.floor(random() * CATEGORY_COUNTS.series)),
      year: String(year),
      releaseDate: `${year}-01-01`,
      tmdb: String(500_000 + index),
    };
  }
}

export function seriesInfo(seriesId, seed = 4) {
  const random = seededRandom(seed + seriesId);
  const seasons = 1 + Math.floor(random() * 4);
  const episodes = {};
  for (let season = 1; season <= seasons; season += 1) {
    episodes[String(season)] = Array.from({ length: 6 }, (_, number) => ({
      id: String(seriesId * 100 + season * 10 + number),
      episode_num: number + 1,
      title: `Episode ${number + 1}`,
      container_extension: "mp4",
      info: { plot: "Generated episode.", movie_image: `http://127.0.0.1/icons/episode/${seriesId}.jpg` },
    }));
  }
  return { episodes };
}

export function userInfo(username) {
  return {
    user_info: { username, auth: 1, status: "Active", exp_date: "4102444800", max_connections: "1" },
    server_info: { url: "127.0.0.1", port: "0", server_protocol: "http" },
  };
}

/** Serializes an iterable as a JSON array in chunks, so large sizes never build one giant string. */
export function* jsonArrayChunks(rows, chunkRows = 2_000) {
  let batch = [];
  let first = true;
  yield "[";
  for (const row of rows) {
    batch.push(JSON.stringify(row));
    if (batch.length === chunkRows) {
      yield (first ? "" : ",") + batch.join(",");
      first = false;
      batch = [];
    }
  }
  if (batch.length) yield (first ? "" : ",") + batch.join(",");
  yield "]";
}

export function sizeFor(name) {
  const size = SIZES[name];
  if (!size) throw new Error(`Unknown size "${name}". Use one of: ${Object.keys(SIZES).join(", ")}.`);
  return size;
}

if (process.argv[1]?.endsWith("dataset.mjs")) {
  const arg = process.argv.indexOf("--size");
  const name = arg >= 0 ? process.argv[arg + 1] : "S";
  const size = sizeFor(name);
  console.log(`Dataset ${name}: ${size.channels} channels, ${size.movies} movies, ${size.series} series (seeded, deterministic).`);
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0) {
    const { createWriteStream, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = process.argv[outIndex + 1];
    mkdirSync(dir, { recursive: true });
    for (const [file, rows] of [["live.json", liveStreams(size.channels)], ["vod.json", vodStreams(size.movies)], ["series.json", seriesList(size.series)]]) {
      const stream = createWriteStream(join(dir, file));
      for (const chunk of jsonArrayChunks(rows)) stream.write(chunk);
      stream.end();
      console.log(`wrote ${join(dir, file)}`);
    }
  }
}
