import * as acorn from "acorn";
import * as babel from "@babel/parser";
import * as oxc from "oxc-parser";
import swc from "@swc/core";
import { parseSync as swcNextParseSync, type Lang } from "@swc-next/parser";
import type { ParseOptions as SwcParseOptions } from "@swc/types";
import { parse as yukuParseSync, type SourceLang } from "yuku";
import files from "./files.json" with { type: "json" };

export const FILES = files as Record<string, { path: string; lang: SourceLang; source_url: string }>;

export interface FlatComment {
  type: string;
  value: string;
  start?: number;
  end?: number;
}

export interface ParseOutput {
  program: unknown;
  comments: readonly FlatComment[] | null;
  diagnostics: string[];
}

type ParserMode = "compare" | "benchmark";

function isTsLang(lang: SourceLang): boolean {
  return lang === "ts" || lang === "tsx" || lang === "dts";
}

export function parserNamesFor(lang: SourceLang): string[] {
  return isTsLang(lang) || lang === "jsx"
    ? ["Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"]
    : ["Acorn", "Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"];
}

/** Select callbacks before timing; the measured callback only parses and reads the AST. */
function parserTask<T>(mode: ParserMode, parse: () => T, ast: (parsed: T) => unknown, output: (parsed: T) => ParseOutput): () => ParseOutput | void {
  if (mode === "compare") return () => output(parse());
  return () => { ast(parse()); };
}

export function createParserTasks(source: string, lang: SourceLang, mode?: "compare"): Record<string, () => ParseOutput>;
export function createParserTasks(source: string, lang: SourceLang, mode: "benchmark"): Record<string, () => void>;
export function createParserTasks(source: string, lang: SourceLang, mode: ParserMode = "compare"): Record<string, () => ParseOutput | void> {
  const isTs = isTsLang(lang);
  const isJsx = lang === "tsx" || lang === "jsx";
  const isDts = lang === "dts";
  const isCompare = mode === "compare";
  const sourceType: "script" | "module" = isDts ? "script" : "module";
  const tasks: Record<string, () => ParseOutput | void> = {};

  if (!isTs && !isJsx) {
    const comments: FlatComment[] = [];
    const options: acorn.Options = { ecmaVersion: "latest", sourceType: "module" };
    if (isCompare) {
      options.preserveParens = true;
      options.onComment = comments as acorn.Comment[];
    }
    tasks.Acorn = parserTask(mode,
      () => acorn.parse(source, options),
      program => program.body,
      program => {
        // Each parse has its own list; Acorn also exposes hashbang via onComment.
        const parsedComments = comments.splice(0);
        const hashbang = source.startsWith("#!") ? parsedComments.find(comment => comment.start === 0) : undefined;
        if (hashbang) Object.assign(program, { hashbang: { type: "Hashbang", value: hashbang.value } });
        return { program, comments: parsedComments, diagnostics: [] };
      });
  }

  const babelPlugins: babel.ParserPlugin[] = [];
  if (isTs) babelPlugins.push(isDts ? ["typescript", { dts: true }] : "typescript");
  if (isJsx) babelPlugins.push("jsx");
  const babelOptions: babel.ParserOptions = isCompare
    ? { sourceType, plugins: babelPlugins, createParenthesizedExpressions: true, allowImportExportEverywhere: isDts }
    : { sourceType: "module", plugins: babelPlugins, errorRecovery: isTs };
  tasks.Babel = parserTask(mode,
    () => babel.parse(source, babelOptions),
    parsed => parsed.program,
    parsed => ({ program: parsed.program, comments: parsed.comments ?? [], diagnostics: (parsed.errors ?? []).map(error => error!.message) }));

  const filename = isDts ? "bench.d.ts" : isJsx ? (isTs ? "bench.tsx" : "bench.jsx") : isTs ? "bench.ts" : "bench.js";
  const oxcOptions: oxc.ParserOptions | undefined = isCompare ? { lang, sourceType, preserveParens: true } : undefined;
  for (const raw of [false, true]) {
    const options = raw ? { ...oxcOptions, experimentalRawTransfer: true } as oxc.ParserOptions & { experimentalRawTransfer: true } : oxcOptions;
    tasks[raw ? "Oxc (raw transfer)" : "Oxc"] = parserTask(mode,
      () => oxc.parseSync(filename, source, options),
      parsed => parsed.program,
      parsed => ({ program: parsed.program, comments: parsed.comments, diagnostics: parsed.errors.map(error => error.message) }));
  }

  const swcOptions: SwcParseOptions & { isModule?: boolean } = isTs
    ? { syntax: "typescript", tsx: isJsx, isModule: !isDts }
    : isJsx ? { syntax: "ecmascript", jsx: true } : { syntax: "ecmascript" };
  if (isCompare) {
    swcOptions.comments = true;
    if (swcOptions.syntax === "ecmascript") { swcOptions.jsx = isJsx; swcOptions.isModule = true; }
  }
  tasks.SWC = parserTask(mode,
    () => swc.parseSync(source, swcOptions),
    program => program.body,
    program => ({ program, comments: null, diagnostics: [] }));

  const swcNextOptions = isCompare ? { lang: lang as Lang, sourceType, comments: "flat" as const, preserveParens: true } : { lang: lang as Lang };
  tasks["SWC Next"] = parserTask(mode,
    () => swcNextParseSync(source, swcNextOptions),
    parsed => parsed.program,
    parsed => ({ program: parsed.program, comments: parsed.comments, diagnostics: parsed.diagnostics
      .filter(diagnostic => diagnostic.severity === "error").map(diagnostic => diagnostic.message) }));

  const yukuOptions = isCompare ? { lang, sourceType, preserveParens: true } : lang === "js" ? undefined : { lang };
  tasks.Yuku = parserTask(mode,
    () => yukuParseSync(source, yukuOptions),
    parsed => parsed.program,
    parsed => ({ program: parsed.program, comments: parsed.comments,
      diagnostics: parsed.diagnostics.map(diagnostic => `${diagnostic.message} at [${diagnostic.start}, ${diagnostic.end})`) }));
  return tasks;
}

export function parserLabel(name: string, parserNames: string[]): string {
  return `Parser ${String.fromCharCode(65 + parserNames.indexOf(name))}`;
}
