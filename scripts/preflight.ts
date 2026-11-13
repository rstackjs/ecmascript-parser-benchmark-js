import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { FILES, createParserTasks, parserNamesFor } from "./parsers.ts";
import { normalizeParseResult, compareParseResult, type NormalizedParseResult } from "./compare-parse-result/index.ts";
import type { SourceLang } from "yuku";

function fileConfig(input: string): { path: string; lang: SourceLang } {
  if (FILES[input]) return FILES[input];
  const lang: SourceLang = input.endsWith(".d.ts") ? "dts" : input.endsWith(".tsx") ? "tsx" : input.endsWith(".jsx") ? "jsx" : input.endsWith(".ts") ? "ts" : "js";
  return { path: input, lang };
}

export async function preflightFile(input: string): Promise<void> {
  const file = fileConfig(input);
  const source = await readFile(file.path, "utf-8");
  const tasks = createParserTasks(source, file.lang);
  const results: (NormalizedParseResult & { name: string })[] = parserNamesFor(file.lang).map(name => {
    const task = tasks[name]!;
    let parsed: unknown;
    try {
      parsed = task();
    } catch (error) {
      const failure = { program: undefined, comments: null, diagnostics: [error instanceof Error ? error.message : String(error)] };
      return { name, ...normalizeParseResult(failure, name) };
    }
    // Result inspection and normalization bugs are not parser diagnostics.
    return { name, ...normalizeParseResult(parsed, name, source) };
  });
  const reference = results.find(result => result.name === "Oxc")!;
  for (const result of results) {
    if (result.name === "Oxc") continue;
    // @swc/core parseSync does not expose its collected comments. Keep the
    // limitation explicit; never substitute another parser's comment list.
    const isSwcCommentsUnavailable = result.name === "SWC" && result.comments === null;
    try { compareParseResult(isSwcCommentsUnavailable ? { ...reference, comments: null } : reference, result); }
    catch (error) { throw new Error(`${file.path}: ${result.name} versus Oxc: ${error instanceof Error ? error.message : String(error)}`); }
    if (isSwcCommentsUnavailable) console.warn(`${file.path}: SWC comments unavailable; checked AST and diagnostics only.`);
  }
}

async function main() {
  const inputs = process.argv.slice(2);
  for (const input of inputs.length ? inputs : Object.keys(FILES)) await preflightFile(input);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
