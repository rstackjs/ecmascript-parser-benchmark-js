export interface NormalizedParseResult {
  ast: unknown;
  diagnostics: string[];
}

/** Keep diagnostic wording: equal counts do not establish equivalent errors. */
function normalizeDiagnostics(diagnostics: readonly string[]): string[] {
  return diagnostics.map(message => message.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim());
}

export function resultWithAst(ast: unknown, diagnostics: readonly string[]): NormalizedParseResult {
  const errors = normalizeDiagnostics(diagnostics);
  if ((ast === null || typeof ast !== "object") && errors.length === 0) errors.push("Returned no AST");
  return { ast, diagnostics: errors };
}
