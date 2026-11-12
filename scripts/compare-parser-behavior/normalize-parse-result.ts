import type { ParseOutput } from "../parsers.ts";
import { normalizeAst } from "./normalize-ast.ts";
import { normalizeBabelParseResult } from "./normalize-babel-parse-result.ts";
import { normalizeSwcParseResult } from "./normalize-swc-parse-result.ts";
import { resultWithAst, type NormalizedParseResult } from "./parse-result.ts";
export { normalizeAst } from "./normalize-ast.ts";
export { normalizeParseFailure, type NormalizedParseResult } from "./parse-result.ts";

/** Normalize a complete parse result without consulting another parser's output. */
export function normalizeParseResult(output: ParseOutput, parser?: string): NormalizedParseResult {
  if (parser === "Babel") return normalizeBabelParseResult(output);
  if (parser === "SWC") return normalizeSwcParseResult(output);
  return resultWithAst(normalizeAst(output.program), output.diagnostics);
}
