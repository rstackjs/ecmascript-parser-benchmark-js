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

export interface ParserTask {
  run: () => unknown;
  toParseResult: (parsed: unknown) => ParseOutput;
}

function isTsLang(lang: SourceLang): boolean {
  return lang === "ts" || lang === "tsx" || lang === "dts";
}

export function parserNamesFor(lang: SourceLang): string[] {
  return isTsLang(lang) || lang === "jsx"
    ? ["Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"]
    : ["Acorn", "Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"];
}

/** Both callers use the same parse and AST access; result inspection is untimed. */
function parserTask<T>(
  parse: () => T,
  readAst: (parsed: T) => unknown,
  toParseResult: (parsed: T) => ParseOutput,
): ParserTask {
  return {
    run: () => {
      const parsed = parse();
      readAst(parsed);
      return parsed;
    },
    toParseResult: parsed => toParseResult(parsed as T),
  };
}

export function createParserTasks(source: string, lang: SourceLang): Record<string, ParserTask> {
  const isTs = isTsLang(lang);
  const isJsx = lang === "tsx" || lang === "jsx";
  const isDts = lang === "dts";
  const sourceType = isDts ? "script" : "module";
  const tasks: Record<string, ParserTask> = {};

  if (!isTs && !isJsx) {
    tasks.Acorn = parserTask(
      () => {
        const comments: acorn.Comment[] = [];
        const program = acorn.parse(source, {
          ecmaVersion: "latest",
          sourceType,
          preserveParens: true,
          onComment: comments,
        });
        return Object.assign(program, { comments });
      },
      program => program.body,
      program => {
        // Acorn exposes the hashbang via onComment rather than Program.
        const hashbang = source.startsWith("#!")
          ? program.comments.find(comment => comment.start === 0)
          : undefined;
        return {
          program: hashbang
            ? { ...program, hashbang: { type: "Hashbang", value: hashbang.value } }
            : program,
          comments: program.comments,
          diagnostics: [],
        };
      },
    );
  }

  const babelPlugins: babel.ParserPlugin[] = [];
  if (isTs) babelPlugins.push(isDts ? ["typescript", { dts: true }] : "typescript");
  if (isJsx) babelPlugins.push("jsx");
  tasks.Babel = parserTask(
    () => babel.parse(source, {
      sourceType,
      plugins: babelPlugins,
      createParenthesizedExpressions: true,
      allowImportExportEverywhere: isDts,
      errorRecovery: isTs,
    }),
    parsed => parsed.program,
    parsed => ({
      program: parsed.program,
      comments: parsed.comments ?? [],
      diagnostics: (parsed.errors ?? []).map(error => error!.message),
    }),
  );

  const filename = isDts ? "bench.d.ts" : isJsx ? (isTs ? "bench.tsx" : "bench.jsx") : isTs ? "bench.ts" : "bench.js";
  for (const isRawTransfer of [false, true]) {
    tasks[isRawTransfer ? "Oxc (raw transfer)" : "Oxc"] = parserTask(
      () => oxc.parseSync(filename, source, {
        lang,
        sourceType,
        preserveParens: true,
        experimentalRawTransfer: isRawTransfer,
      } as oxc.ParserOptions & { experimentalRawTransfer: boolean }),
      parsed => parsed.program,
      parsed => ({
        program: parsed.program,
        comments: parsed.comments,
        diagnostics: parsed.errors.map(error => error.message),
      }),
    );
  }

  tasks.SWC = parserTask(
    () => swc.parseSync(source, {
      syntax: isTs ? "typescript" : "ecmascript",
      ...(isTs ? { tsx: isJsx } : { jsx: isJsx }),
      // SWC accepts this option at runtime; its type declaration omits it.
      isModule: !isDts,
    } as SwcParseOptions & { isModule: boolean }),
    program => program.body,
    program => ({ program, comments: null, diagnostics: [] }),
  );

  tasks["SWC Next"] = parserTask(
    () => swcNextParseSync(source, {
      lang: lang as Lang,
      sourceType,
      comments: "flat",
      preserveParens: true,
    }),
    parsed => parsed.program,
    parsed => ({
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.diagnostics
        .filter(diagnostic => diagnostic.severity === "error")
        .map(diagnostic => diagnostic.message),
    }),
  );

  tasks.Yuku = parserTask(
    () => yukuParseSync(source, {
      lang,
      sourceType,
      preserveParens: true,
    }),
    parsed => parsed.program,
    parsed => ({
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.diagnostics.map(
        diagnostic => `${diagnostic.message} at [${diagnostic.start}, ${diagnostic.end})`,
      ),
    }),
  );
  return tasks;
}

export function parserLabel(name: string, parserNames: string[]): string {
  return `Parser ${String.fromCharCode(65 + parserNames.indexOf(name))}`;
}
