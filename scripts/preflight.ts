import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { FILES, createParserTasks, parserNamesFor } from "./parsers.ts";
import type { SourceLang } from "yuku";

// Only discard representation metadata. Do not synthesize nodes or use the
// reference AST to repair another parser's output.
const METADATA = new Set([
  "loc", "start", "end", "span", "range", "ctxt", "bodyCtxt", "extra",
  "parent", "tokens", "raw", "comments", "leadingComments", "trailingComments",
  "innerComments",
]);

export function normalizeAst(value: unknown): unknown {
  if (typeof value === "bigint") return { bigint: value.toString() };
  if (value instanceof RegExp) return { pattern: value.source, flags: value.flags };
  if (Array.isArray(value)) return value.map(normalizeAst);
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (!METADATA.has(key) && item !== undefined) output[key] = normalizeAst(item);
  }
  return output;
}

export interface Difference {
  path: string;
  expected: unknown;
  actual: unknown;
}

export function firstDifference(expected: unknown, actual: unknown, path = "$"): Difference | undefined {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return { path: `${path}.length`, expected: expected.length, actual: actual.length };
    for (let index = 0; index < expected.length; index++) {
      const difference = firstDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return;
  }
  if (expected !== null && actual !== null && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) && !Array.isArray(actual)) {
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
        return { path: `${path}.${key}`, expected: Object.hasOwn(left, key) ? left[key] : "<absent>", actual: Object.hasOwn(right, key) ? right[key] : "<absent>" };
      }
      const difference = firstDifference(left[key], right[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return;
  }
  return { path, expected, actual };
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value !== null && typeof value === "object") return `Object(${Object.keys(value).slice(0, 8).join(", ")})`;
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function assertMatchingAst(reference: unknown, actual: unknown, file: string, parser: string): void {
  const difference = firstDifference(normalizeAst(reference), normalizeAst(actual));
  if (difference) {
    throw new Error(`${file}: ${parser} differs from Oxc at ${difference.path}: expected ${describe(difference.expected)}, actual ${describe(difference.actual)}`);
  }
}

function fileConfig(input: string): { path: string; lang: SourceLang } {
  if (FILES[input]) return FILES[input];
  const lang: SourceLang = input.endsWith(".d.ts") ? "dts" : input.endsWith(".tsx") ? "tsx" : input.endsWith(".jsx") ? "jsx" : input.endsWith(".ts") ? "ts" : "js";
  return { path: input, lang };
}

export async function preflightFile(input: string): Promise<void> {
  const file = fileConfig(input);
  const source = await readFile(file.path, "utf-8");
  const tasks = createParserTasks(source, file.lang);
  const parse = (name: string) => {
    let output;
    try { output = tasks[name]!(); }
    catch (error) { throw new Error(`${file.path}: ${name} parse failed`, { cause: error }); }
    if (output.diagnostics.length) throw new Error(`${file.path}: ${name} diagnostics: ${output.diagnostics.join("; ")}`);
    if (output.program === null || typeof output.program !== "object") throw new Error(`${file.path}: ${name} returned no AST`);
    return output.program;
  };
  const reference = parse("Oxc");
  for (const name of parserNamesFor(file.lang)) {
    if (name !== "Oxc") assertMatchingAst(reference, parse(name), file.path, name);
  }
}

async function main() {
  const inputs = process.argv.slice(2);
  for (const input of inputs.length ? inputs : Object.keys(FILES)) await preflightFile(input);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
