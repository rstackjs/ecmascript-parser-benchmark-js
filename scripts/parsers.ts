import * as acorn from "acorn";
import * as babel from "@babel/parser";
import * as oxc from "oxc-parser";
import swc from "@swc/core";
import { parseSync as swcNextParseSync, type Lang } from "@swc-next/parser";
import type { ParseOptions as SwcParseOptions } from "@swc/types";
import { parse as yukuParseSync, type SourceLang } from "yuku";
import files from "./files.json" with { type: "json" };

export const FILES = files as Record<string, { path: string; lang: SourceLang; source_url: string }>;

function isTsLang(lang: SourceLang): boolean {
  return lang === "ts" || lang === "tsx" || lang === "dts";
}

export function parserNamesFor(lang: SourceLang): string[] {
  return isTsLang(lang) || lang === "jsx"
    ? ["Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"]
    : ["Acorn", "Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"];
}

// Read the AST before returning: lazy JavaScript AST construction is timed.
export function createParserTasks(source: string, lang: SourceLang): Record<string, () => unknown> {
  const isTs = isTsLang(lang);
  const isJsx = lang === "tsx" || lang === "jsx";
  const isDts = lang === "dts";
  const sourceType = isDts ? "script" : "module";
  const tasks: Record<string, () => unknown> = {};

  if (!isTs && !isJsx) {
    tasks.Acorn = () => {
      const comments: acorn.Comment[] = [];
      const program = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType,
        preserveParens: true,
        onComment: comments,
      });
      program.body;
      return Object.assign(program, { comments });
    };
  }

  const babelPlugins: babel.ParserPlugin[] = [];
  if (isTs) babelPlugins.push(isDts ? ["typescript", { dts: true }] : "typescript");
  if (isJsx) babelPlugins.push("jsx");
  tasks.Babel = () => {
    const parsed = babel.parse(source, {
      sourceType,
      plugins: babelPlugins,
      createParenthesizedExpressions: true,
      allowImportExportEverywhere: isDts,
      errorRecovery: isTs,
    });
    parsed.program;
    return parsed;
  };

  const filename = isDts ? "bench.d.ts" : isJsx ? (isTs ? "bench.tsx" : "bench.jsx") : isTs ? "bench.ts" : "bench.js";
  for (const isRawTransfer of [false, true]) {
    tasks[isRawTransfer ? "Oxc (raw transfer)" : "Oxc"] = () => {
      const parsed = oxc.parseSync(filename, source, {
        lang,
        sourceType,
        preserveParens: true,
        experimentalRawTransfer: isRawTransfer,
      } as oxc.ParserOptions & { experimentalRawTransfer: boolean });
      parsed.program;
      return parsed;
    };
  }

  tasks.SWC = () => {
    const program = swc.parseSync(source, {
      syntax: isTs ? "typescript" : "ecmascript",
      ...(isTs ? { tsx: isJsx } : { jsx: isJsx }),
      // SWC accepts this option at runtime; its type declaration omits it.
      isModule: !isDts,
    } as SwcParseOptions & { isModule: boolean });
    program.body;
    return program;
  };

  tasks["SWC Next"] = () => {
    const parsed = swcNextParseSync(source, {
      lang: lang as Lang,
      sourceType,
      comments: "flat",
      preserveParens: true,
    });
    parsed.program;
    return parsed;
  };

  tasks.Yuku = () => {
    const parsed = yukuParseSync(source, {
      lang,
      sourceType,
      preserveParens: true,
    });
    parsed.program;
    return parsed;
  };
  return tasks;
}

export function parserLabel(name: string, parserNames: string[]): string {
  return `Parser ${String.fromCharCode(65 + parserNames.indexOf(name))}`;
}
