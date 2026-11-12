import * as acorn from "acorn";
import * as babel from "@babel/parser";
import * as oxc from "oxc-parser";
import swc from "@swc/core";
import { parseSync as swcNextParseSync, type Lang } from "@swc-next/parser";
import type { ParseOptions as SwcParseOptions } from "@swc/types";
import { parse as yukuParseSync, type SourceLang } from "yuku";
export const FILES: Record<string, { path: string; lang: SourceLang }> = {
  typescript: { path: "files/typescript.js", lang: "js" },
  checker: { path: "files/checker.ts", lang: "ts" },
  lib_dom: { path: "files/lib.dom.d.ts", lang: "dts" },
  react: { path: "files/react.js", lang: "js" },
};

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

function isTsLang(lang: SourceLang): boolean {
  return lang === "ts" || lang === "tsx" || lang === "dts";
}

export function parserNamesFor(lang: SourceLang): string[] {
  return isTsLang(lang)
    ? ["Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"]
    : ["Acorn", "Babel", "Oxc", "Oxc (raw transfer)", "SWC", "SWC Next", "Yuku"];
}

export function createParserTasks(source: string, lang: SourceLang): Record<string, () => ParseOutput> {
  const isTs = isTsLang(lang);
  const isJsx = lang === "tsx";
  const isDts = lang === "dts";
  const sourceType = isDts ? "script" : "module";
  const tasks: Record<string, () => ParseOutput> = {};

  if (!isTs) {
    tasks.Acorn = () => {
      const comments: FlatComment[] = [];
      const program = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType,
        preserveParens: true,
        onComment: comments as acorn.Comment[],
      });
      return { program, comments, diagnostics: [] };
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
    });
    return { program: parsed.program, comments: parsed.comments ?? [], diagnostics: [] };
  };

  const oxcFilename = isDts ? "bench.d.ts" : isJsx ? "bench.tsx" : isTs ? "bench.ts" : "bench.js";
  tasks.Oxc = () => {
    const parsed = oxc.parseSync(oxcFilename, source, {
      lang,
      sourceType,
      preserveParens: true,
    });
    return {
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.errors.map((error) => error.message),
    };
  };

  tasks["Oxc (raw transfer)"] = () => {
    const parsed = oxc.parseSync(oxcFilename, source, {
      lang, sourceType, preserveParens: true,
      experimentalRawTransfer: true,
    } as oxc.ParserOptions & { experimentalRawTransfer: true });
    return { program: parsed.program, comments: parsed.comments,
      diagnostics: parsed.errors.map(error => error.message) };
  };

  const swcSyntax: SwcParseOptions & { isModule?: boolean } = isTs
    ? { syntax: "typescript", tsx: isJsx, isModule: !isDts }
    : { syntax: "ecmascript", isModule: true };
  tasks.SWC = () => {
    const program = swc.parseSync(source, { ...swcSyntax, comments: true });
    return { program, comments: null, diagnostics: [] };
  };

  tasks["SWC Next"] = () => {
    const parsed = swcNextParseSync(source, {
      lang: lang as Lang,
      sourceType,
      comments: "flat",
      preserveParens: true,
    });
    return {
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => diagnostic.message),
    };
  };

  tasks.Yuku = () => {
    const parsed = yukuParseSync(source, { lang, sourceType, preserveParens: true });
    return {
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.diagnostics.map(
        (diagnostic) => `${diagnostic.message} at [${diagnostic.start}, ${diagnostic.end})`,
      ),
    };
  };

  return tasks;
}

export function parserLabel(name: string, parserNames: string[]): string {
  return `Parser ${String.fromCharCode(65 + parserNames.indexOf(name))}`;
}

