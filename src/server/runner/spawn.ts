import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type SpawnRunOptions = {
  outDir: string; // generated project root
  reporterJsonPath: string; // absolute path to write JSON reporter output
  baseURL?: string;
  storageStatePath?: string | null;
  testFilter?: string;
};

export type SpawnedRun = {
  proc: ChildProcess;
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
  done: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

export function spawnPlaywright(opts: SpawnRunOptions): SpawnedRun {
  fs.mkdirSync(path.dirname(opts.reporterJsonPath), { recursive: true });

  // Prefer the project-local binary so we don't rely on `npx`'s install
  // resolution behaviour (which differs between npm versions and can prompt).
  const localBin = path.join(opts.outDir, "node_modules", ".bin", "playwright");
  const usingLocal = fs.existsSync(localBin);
  const cmd = usingLocal ? localBin : "npx";
  const args = usingLocal ? ["test", "--reporter=json"] : ["playwright", "test", "--reporter=json"];
  if (opts.testFilter) args.push(opts.testFilter);

  // The spawned Playwright process runs LLM-generated test code. Don't hand
  // it the parent process env (API keys, internal secrets). Pass only what
  // Playwright + its node runtime actually need.
  const allowedFromParent = ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TZ", "TMPDIR", "SHELL", "SHLVL", "TERM", "PWD"] as const;
  const env: NodeJS.ProcessEnv = {
    PLAYWRIGHT_JSON_OUTPUT_NAME: opts.reporterJsonPath,
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "",
  };
  for (const k of allowedFromParent) {
    const v = process.env[k];
    if (v != null) env[k] = v;
  }
  if (opts.baseURL) env.BASE_URL = opts.baseURL;
  if (opts.storageStatePath) env.STORAGE_STATE = opts.storageStatePath;

  const proc = spawn(cmd, args, { cwd: opts.outDir, env, stdio: ["ignore", "pipe", "pipe"] });

  return {
    proc,
    stdout: lineIterator(proc.stdout!),
    stderr: lineIterator(proc.stderr!),
    done: new Promise((res) => proc.on("close", (code, signal) => res({ code, signal }))),
  };
}

async function* lineIterator(stream: NodeJS.ReadableStream): AsyncIterable<string> {
  let buf = "";
  for await (const chunk of stream as any as AsyncIterable<Buffer>) {
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line) yield line;
    }
  }
  if (buf) yield buf;
}
