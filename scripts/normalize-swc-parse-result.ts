import type { ParseOutput } from "./parsers.ts";
import { normalizeSwcAst } from "./normalize-swc-ast.ts";
import { resultWithAst, type NormalizedParseResult } from "./parse-result.ts";

export function normalizeSwcParseResult(output: ParseOutput): NormalizedParseResult {
  return resultWithAst(normalizeSwcAst(output.program), output.diagnostics);
}
