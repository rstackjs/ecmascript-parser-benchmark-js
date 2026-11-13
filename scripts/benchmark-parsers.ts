import * as acorn from "acorn";
import * as babel from "@babel/parser";
import * as oxc from "oxc-parser";
import swc from "@swc/core";
import { parseSync as swcNextParseSync, type Lang } from "@swc-next/parser";
import type { ParseOptions as SwcParseOptions } from "@swc/types";
import { parse as yukuParseSync, type SourceLang } from "yuku";

interface BenchmarkTask {
  run: () => void;
  check: () => void;
}

function rejectDiagnostics(messages: readonly string[]): void {
  if (messages.length) throw new Error(`Parse diagnostics: ${messages.join("; ")}`);
}

/** Preserve the pre-preflight benchmark workload and parser options. */
export function createBenchmarkParserTasks(source: string, lang: SourceLang): Record<string, BenchmarkTask> {
  const isTs = lang === "ts" || lang === "tsx" || lang === "dts";
  const isJsx = lang === "tsx" || lang === "jsx";
  const isDts = lang === "dts";
  const tasks: Record<string, BenchmarkTask> = {};

  if (!isTs && !isJsx) {
    const options = { ecmaVersion: "latest", sourceType: "module" } as const;
    tasks.Acorn = {
      run: () => { const { body: _ } = acorn.parse(source, options); },
      check: () => { acorn.parse(source, options); },
    };
  }

  const plugins: babel.ParserPlugin[] = [];
  if (isTs) plugins.push(isDts ? ["typescript", { dts: true }] : "typescript");
  if (isJsx) plugins.push("jsx");
  const babelOptions: babel.ParserOptions = { sourceType: "module", plugins, errorRecovery: isTs };
  tasks.Babel = {
    run: () => { const { program: _ } = babel.parse(source, babelOptions); },
    check: () => {
      const parsed = babel.parse(source, babelOptions);
      rejectDiagnostics((parsed.errors ?? []).map(error => error!.message));
    },
  };

  const filename = isDts ? "bench.d.ts" : isJsx ? (isTs ? "bench.tsx" : "bench.jsx") : isTs ? "bench.ts" : "bench.js";
  const rawOptions = { experimentalRawTransfer: true } as oxc.ParserOptions & { experimentalRawTransfer: true };
  tasks.Oxc = {
    run: () => { const { program: _ } = oxc.parseSync(filename, source); },
    check: () => { rejectDiagnostics(oxc.parseSync(filename, source).errors.map(error => error.message)); },
  };
  tasks["Oxc (raw transfer)"] = {
    run: () => { const { program: _ } = oxc.parseSync(filename, source, rawOptions); },
    check: () => { rejectDiagnostics(oxc.parseSync(filename, source, rawOptions).errors.map(error => error.message)); },
  };

  // The original benchmark uses script mode for global declaration files.
  const swcOptions: SwcParseOptions & { isModule?: boolean } = isTs
    ? { syntax: "typescript", tsx: isJsx, isModule: !isDts }
    : isJsx ? { syntax: "ecmascript", jsx: true } : { syntax: "ecmascript" };
  tasks.SWC = {
    run: () => { const { body: _ } = swc.parseSync(source, swcOptions); },
    check: () => { swc.parseSync(source, swcOptions); },
  };

  const swcNextOptions = { lang: lang as Lang };
  tasks["SWC Next"] = {
    run: () => { const { program: _ } = swcNextParseSync(source, swcNextOptions); },
    check: () => {
      rejectDiagnostics(swcNextParseSync(source, swcNextOptions).diagnostics
        .filter(diagnostic => diagnostic.severity === "error").map(diagnostic => diagnostic.message));
    },
  };

  const yukuOptions = lang === "js" ? undefined : { lang };
  tasks.Yuku = {
    run: () => { const { program: _ } = yukuParseSync(source, yukuOptions); },
    check: () => { rejectDiagnostics(yukuParseSync(source, yukuOptions).diagnostics.map(diagnostic => diagnostic.message)); },
  };
  return tasks;
}
