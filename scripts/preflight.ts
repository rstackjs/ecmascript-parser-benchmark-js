import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { FILES, createParserTasks, parserNamesFor } from "./parsers.ts";
import { assertMatchingAst, assertMatchingParseErrors, type ParseCheck } from "./compare-parse-result/compare-parse-result.ts";
import type { SourceLang } from "yuku";
import { normalizeParseResult, normalizeParseFailure } from "./compare-parse-result/normalize-parse-result.ts";

function fileConfig(input: string): { path: string; lang: SourceLang } {
  if (FILES[input]) return FILES[input];
  const lang: SourceLang = input.endsWith(".d.ts") ? "dts" : input.endsWith(".tsx") ? "tsx" : input.endsWith(".jsx") ? "jsx" : input.endsWith(".ts") ? "ts" : "js";
  return { path: input, lang };
}

export async function preflightFile(input: string): Promise<void> {
  const file = fileConfig(input);
  const source = await readFile(file.path, "utf-8");
  const tasks = createParserTasks(source, file.lang);
  const results: ParseCheck[] = parserNamesFor(file.lang).map(name => {
    let output;
    try {
      output = tasks[name]!();
    } catch (error) {
      return { name, ...normalizeParseFailure(error) };
    }
    // A normalization bug is not a parser diagnostic.
    return { name, ...normalizeParseResult(output, name) };
  });
  assertMatchingParseErrors(results, file.path);
  const reference = results.find(result => result.name === "Oxc")!;
  for (const result of results) {
    if (result.name !== "Oxc") assertMatchingAst(reference.ast, result.ast, file.path, result.name);
  }
}

async function main() {
  const inputs = process.argv.slice(2);
  for (const input of inputs.length ? inputs : Object.keys(FILES)) await preflightFile(input);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
