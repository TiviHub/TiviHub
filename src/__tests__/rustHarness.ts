import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";

const MANIFEST = path.resolve(__dirname, "../../src-tauri/Cargo.toml");
const PROFILE = process.env.TIVIHUB_HARNESS_PROFILE === "release" ? "release" : "debug";
const EXE = path.resolve(
  __dirname,
  `../../src-tauri/target/${PROFILE}/examples/storage_harness${process.platform === "win32" ? ".exe" : ""}`,
);

let built = false;

export type RustHarness = {
  /** Same shape as Tauri's `invoke`, answered by the real Rust store. */
  invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
  /** Resolves once the process has exited and released its files. */
  close: () => Promise<void>;
};

/** Starts the Rust store (src-tauri/examples/storage_harness.rs) in memory or on a database file. */
export function startRustHarness(databasePath?: string): RustHarness {
  if (!built) {
    execFileSync("cargo", ["build", "--quiet", ...(PROFILE === "release" ? ["--release"] : []), "--manifest-path", MANIFEST, "--example", "storage_harness"], {
      stdio: "inherit",
    });
    built = true;
  }
  const child: ChildProcessWithoutNullStreams = spawn(EXE, databasePath ? [databasePath] : []);
  const pending = new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void }>();
  createInterface({ input: child.stdout }).on("line", (line) => {
    const reply = JSON.parse(line) as { id: number; ok?: never; error?: string };
    const waiter = pending.get(reply.id);
    pending.delete(reply.id);
    if (reply.error !== undefined) waiter?.reject(new Error(reply.error));
    else waiter?.resolve(reply.ok as never);
  });
  let nextId = 0;
  return {
    invoke: <T>(command: string, args: Record<string, unknown> = {}) =>
      new Promise<T>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve: resolve as (value: never) => void, reject });
        child.stdin.write(`${JSON.stringify({ id, command, args })}\n`);
      }),
    close: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill();
      }),
  };
}
