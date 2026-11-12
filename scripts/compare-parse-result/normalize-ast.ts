import { normalizeJsxText } from "./normalize-jsx-text.ts";

/** ESTree metadata is removed only from nodes, never from arbitrary payloads. */
const METADATA = new Set([
  "loc", "start", "end", "span", "range", "ctxt", "bodyCtxt", "extra",
  "parent", "tokens", "raw", "comments", "leadingComments", "trailingComments", "innerComments",
]);
const FALSE_DEFAULTS = new Set([
  "abstract", "async", "computed", "declare", "definite", "generator", "optional",
  "shorthand", "method", "static", "readonly", "override", "const", "in", "out", "global", "selfClosing",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeAst(value: unknown, parentType?: string, field?: string): unknown {
  if (typeof value === "bigint") return { bigint: value.toString() };
  if (value instanceof RegExp) return { pattern: value.source, flags: [...value.flags].sort().join("") };
  if (Array.isArray(value)) return value.map(item => normalizeAst(item, parentType, field)); // Retain array order and null holes.
  if (!isRecord(value)) return value;
  const node = { ...value };
  const isNode = typeof node.type === "string";
  // ESTree parsers may retain entities, while Babel/SWC decode them in value.
  // Prefer raw text when available to avoid double-decoding already cooked text.
  if (node.type === "JSXText" || (parentType === "JSXAttribute" && field === "value" && node.type === "Literal")) {
    const raw = typeof node.raw === "string" ? node.raw : isRecord(node.extra) ? node.extra.raw : undefined;
    if (typeof raw === "string") {
      const text = node.type === "JSXText" ? raw : raw.slice(1, -1);
      const decoded = normalizeJsxText(text);
      // Recognize the two schema conventions, retaining unexpected value errors.
      if (node.value === text || node.value === decoded) node.value = decoded;
    }
  }
  if (node.type === "Literal" && isRecord(node.regex)) {
    // Runtime RegExp construction can fail for unsupported flags (e.g. /v).
    node.value = undefined;
    node.regex = { ...node.regex, flags: typeof node.regex.flags === "string" ? [...node.regex.flags].sort().join("") : node.regex.flags };
  } else if (node.type === "Literal" && node.bigint !== undefined) {
    node.value = undefined;
    node.bigint = BigInt(String(node.bigint).replace(/_/g, "").replace(/n$/, "")).toString();
  }
  if (node.type === "ArrowFunctionExpression") {
    // Redundant with body.type; some parsers omit this field.
    node.expression = undefined;
  } else if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration" || node.type === "TSDeclareFunction") {
    node.expression = undefined;
  }
  if (node.type === "UnaryExpression") node.prefix = undefined; // Unary expressions are always prefix.
  if (node.type === "TSEmptyBodyFunctionExpression") node.expression = undefined;
  if ((node.type === "ImportDeclaration" && node.importKind === "value") || (node.type === "ImportSpecifier" && node.importKind === "value")) node.importKind = undefined;
  if (typeof node.type === "string" && node.type.startsWith("Export") && node.exportKind === "value") node.exportKind = undefined;
  if (node.type === "ImportDeclaration" && node.phase === "evaluation") node.phase = undefined;
  const output: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(node).sort()) {
    const item = node[key];
    if (isNode && (METADATA.has(key) || (FALSE_DEFAULTS.has(key) && item === false))) continue;
    if (item === undefined) continue;
    // Literal null is a value; null optional fields and empty lists are omitted.
    if (isNode && ((item === null && !(node.type === "Literal" && key === "value")) || (Array.isArray(item) && item.length === 0))) continue;
    output[key] = normalizeAst(item, typeof node.type === "string" ? node.type : undefined, key);
  }
  return output;
}
