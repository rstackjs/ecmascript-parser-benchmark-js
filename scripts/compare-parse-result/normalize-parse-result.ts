import { normalizeAst } from "./normalize-ast.ts";
import { normalizeBabelParseResult } from "./normalize-babel-parse-result.ts";
import { normalizeSwcParseResult } from "./normalize-swc-parse-result.ts";
import { resultWithAst, type NormalizedParseResult } from "./parse-result.ts";
import { readParseResult } from "./read-parse-result.ts";

/** Normalize a complete parse result without consulting another parser's output. */
export function normalizeParseResult(result: unknown, parser?: string, source?: string): NormalizedParseResult {
  const output = readParseResult(result, parser, source);
  if (parser === "Babel") return normalizeBabelParseResult(output);
  if (parser === "SWC") return normalizeSwcParseResult(output);
  return resultWithAst(normalizeAst(output.program), output);
}
