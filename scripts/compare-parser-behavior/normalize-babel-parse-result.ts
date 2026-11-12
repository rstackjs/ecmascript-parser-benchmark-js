import type { ParseOutput } from "../parsers.ts";
import { normalizeAst } from "./normalize-ast.ts";
import { resultWithAst, type NormalizedParseResult } from "./parse-result.ts";

/** Babel's structural and diagnostic adapters have their own entry point. */
export function normalizeBabelParseResult(output: ParseOutput): NormalizedParseResult {
  // Full Babel schema conversion is deferred; retain structural differences.
  return resultWithAst(normalizeAst(output.program), output.diagnostics);
}
