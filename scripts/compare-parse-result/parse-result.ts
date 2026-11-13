import { normalizeComments } from "./normalize-comments.ts";

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

export interface NormalizedParseResult {
  ast: unknown;
  comments: readonly Pick<FlatComment, "type" | "value">[] | null;
  diagnostics: string[];
}

/** Keep diagnostic wording: equal counts do not establish equivalent errors. */
function normalizeDiagnostics(diagnostics: readonly string[]): string[] {
  return diagnostics.map(message => message.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim());
}

export function resultWithAst(ast: unknown, output: ParseOutput): NormalizedParseResult {
  const errors = normalizeDiagnostics(output.diagnostics);
  if ((ast === null || typeof ast !== "object") && errors.length === 0) errors.push("Returned no AST");
  return { ast, comments: normalizeComments(output), diagnostics: errors };
}
