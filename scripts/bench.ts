import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Bench } from "tinybench";
import * as oxc from "oxc-parser";
import type { SourceLang } from "yuku";
import { FILES, createParserTasks, parserNamesFor, parserLabel } from "./parsers.ts";
const BENCH_TIME = Number(process.env.BENCH_TIME ?? 10000);
const BENCH_WARMUP = Number(process.env.BENCH_WARMUP ?? 2000);
const BENCH_RUNS = Number(process.env.BENCH_RUNS ?? 3);
interface RunResult {
  name: string;
  mean: number;
  min: number;
  max: number;
  median: number;
  stddev: number;
  rme: number;
  samples: number;
}

interface BenchResult extends RunResult {
  runs: number;
}

interface FileResult {
  file: string;
  results: BenchResult[];
}

function spawnChild(args: string[], stderr: "pipe" | "inherit") {
  const runtimeArgs = process.execArgv;
  const proc = spawnSync(
    process.execPath,
    [...runtimeArgs, ...args],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", stderr],
    },
  );
  if (proc.error) {
    throw new Error(`Could not start child process: ${proc.error.message}`);
  }
  return proc;
}

// Child mode: benchmark a single parser against a single file in a fresh
// process, so JIT state and GC pressure from one parser never affect another.
// Emits a single JSON object on stdout, all logging goes to stderr.

async function runTask(fileKey: string, parserName: string): Promise<void> {
  const file = FILES[fileKey];
  if (!file) throw new Error(`Unknown file: ${fileKey}`);

  const source = await readFile(join(process.cwd(), file.path), "utf-8");
  const task = createParserTasks(source, file.lang, "benchmark")[parserName];
  if (!task) {
    const label = parserLabel(parserName, parserNamesFor(file.lang));
    throw new Error(`${label} does not support ${fileKey}`);
  }

  task.check();

  const bench = new Bench({ time: BENCH_TIME, warmupTime: BENCH_WARMUP });
  bench.add(parserName, task.run);
  await bench.run();

  const measuredTask = bench.tasks[0];
  if (!measuredTask?.result || measuredTask.result.state !== "completed") {
    process.stdout.write(JSON.stringify({ ok: false }));
    return;
  }

  const latency = measuredTask.result.latency;
  const result: RunResult = {
    name: parserName,
    mean: latency.mean,
    min: latency.min,
    max: latency.max,
    median: latency.p50,
    stddev: latency.sd,
    rme: latency.rme,
    samples: latency.samplesCount,
  };
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function aggregateRuns(name: string, runs: RunResult[]): BenchResult {
  return {
    name,
    mean: median(runs.map((r) => r.mean)),
    min: Math.min(...runs.map((r) => r.min)),
    max: Math.max(...runs.map((r) => r.max)),
    median: median(runs.map((r) => r.median)),
    stddev: median(runs.map((r) => r.stddev)),
    rme: median(runs.map((r) => r.rme)),
    samples: runs.reduce((sum, r) => sum + r.samples, 0),
    runs: runs.length,
  };
}

async function benchFile(
  fileKey: string,
  file: { path: string; lang: SourceLang },
): Promise<FileResult> {
  console.log(`\nBenchmarking ${fileKey}...`);

  const results: BenchResult[] = [];
  const parserNames = parserNamesFor(file.lang);
  const parserLabelFor = (name: string) => parserLabel(name, parserNames);

  const runsByParser = new Map(parserNames.map((name) => [name, [] as RunResult[]]));
  const check = spawnChild([new URL("./preflight.ts", import.meta.url).pathname, fileKey], "inherit");
  if (check.status !== 0) throw new Error(`Preflight failed for ${fileKey}`);
  {
    for (let run = 1; run <= BENCH_RUNS; run++) {
      const orderedParsers = Array.from({ length: parserNames.length }, (_, i) =>
        parserNames[(i + run - 1) % parserNames.length]!,
      );
      for (const name of orderedParsers) {
        console.log(`  ${parserLabelFor(name)} (run ${run}/${BENCH_RUNS})`);
        const proc = spawnChild(
          [import.meta.filename, "--task", fileKey, name],
          "inherit",
        );
        if (proc.status !== 0) {
          const exit = proc.signal
            ? `signal ${proc.signal}`
            : `exit code ${proc.status ?? "unknown"}`;
          throw new Error(`${parserLabelFor(name)} run ${run} failed with ${exit}`);
        }
        let out: { ok: boolean; result?: RunResult; error?: string };
        try {
          out = JSON.parse(proc.stdout ?? "") as { ok: boolean; result?: RunResult };
        } catch {
          throw new Error(`${parserLabelFor(name)} run ${run} returned invalid benchmark output`);
        }
        if (out.ok && out.result) runsByParser.get(name)!.push(out.result);
        else throw new Error(`${parserLabelFor(name)} run ${run} failed: ${out.error ?? "incomplete result"}`);
      }
    }
  }
  for (const name of parserNames) results.push(aggregateRuns(name, runsByParser.get(name)!));

  results.sort((a, b) => a.median - b.median);
  console.table(
    results.map((r) => ({
      Parser: parserLabelFor(r.name),
      "Median (ms)": r.median.toFixed(3),
      "±RME": `${r.rme.toFixed(2)}%`,
      Samples: r.samples,
      Runs: r.runs,
    })),
  );

  return { file: fileKey, results };
}

async function main() {
  if (!oxc.rawTransferSupported()) throw new Error("Oxc raw transfer is unsupported on this runtime/platform");
  const args = process.argv.slice(2);

  if (args[0] === "--task") {
    const [, fileKey, parserName] = args;
    if (!fileKey || !parserName) throw new Error("Usage: bench.ts --task <file> <parser>");
    try {
      await runTask(fileKey, parserName);
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: String(error) }));
    }
    return;
  }

  const filesToBench =
    args.length > 0
      ? Object.entries(FILES).filter(([key]) => args.includes(key))
      : Object.entries(FILES);

  await mkdir(join(process.cwd(), "result"), { recursive: true });

  for (const [key, file] of filesToBench) {
    const result = await benchFile(key, file);
    await writeFile(join(process.cwd(), "result", `${key}.json`), JSON.stringify(result, null, 2));
  }

  console.log("\nBenchmark complete!");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
