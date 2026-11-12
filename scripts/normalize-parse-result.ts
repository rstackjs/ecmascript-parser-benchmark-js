import type { ParseOutput } from "./parsers.ts";

// Only discard representation metadata. Do not synthesize nodes or use the
// reference AST to repair another parser's output.
const METADATA = new Set([
  "loc", "start", "end", "span", "range", "ctxt", "bodyCtxt", "extra",
  "parent", "tokens", "raw", "comments", "leadingComments", "trailingComments",
  "innerComments",
]);

export function normalizeAst(value: unknown, parentKey?: string): unknown {
  if (typeof value === "bigint") return { bigint: value.toString() };
  if (value instanceof RegExp) return { pattern: value.source, flags: [...value.flags].sort().join("") };
  if (Array.isArray(value)) return value.map(item => normalizeAst(item, parentKey));
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (!METADATA.has(key) && item !== undefined) output[key] = key === "flags" && parentKey === "regex" && typeof item === "string" ? [...item].sort().join("") : normalizeAst(item, key);
  }
  return output;
}

export interface NormalizedParseResult {
  ast: unknown;
  diagnostics: string[];
}

/** Normalize one parser output without consulting another parser's AST. */
export function normalizeParseResult(output: ParseOutput): NormalizedParseResult {
  const diagnostics = output.diagnostics.map(message => message.replace(/\s+/g, " ").trim());
  if (output.program === null || typeof output.program !== "object") diagnostics.push("Returned no AST");
  return { ast: normalizeAst(output.program), diagnostics };
}

export function normalizeParseFailure(error: unknown): NormalizedParseResult {
  const message = error instanceof Error ? error.message : String(error);
  return { ast: undefined, diagnostics: [message.replace(/\s+/g, " ").trim()] };
}
