import type { NormalizedParseResult } from "./normalize-parse-result.ts";

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
  if (isObject(expected) && isObject(actual)) return compareObjects(expected, actual, path);
  return { path, expected, actual };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function compareObjects(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  path = "$",
): Difference | undefined {
  for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    const hasExpected = Object.hasOwn(expected, key);
    const hasActual = Object.hasOwn(actual, key);
    if (!hasExpected || !hasActual) {
      const present = hasExpected ? expected[key] : actual[key];
      // Missing optional values and empty lists carry no content.
      const literalValue = key === "value" && (expected.type === "Literal" || actual.type === "Literal");
      if (!literalValue && (present === null || present === undefined || (Array.isArray(present) && present.length === 0))) continue;
      return { path: `${path}.${key}`, expected: hasExpected ? expected[key] : "<absent>", actual: hasActual ? actual[key] : "<absent>" };
    }
    const difference = firstDifference(expected[key], actual[key], `${path}.${key}`);
    if (difference) return difference;
  }
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value !== null && typeof value === "object") return `Object(${Object.keys(value).slice(0, 8).join(", ")})`;
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function assertMatchingAst(reference: unknown, actual: unknown, file: string, parser: string): void {
  const difference = firstDifference(reference, actual);
  if (difference) {
    throw new Error(`${file}: ${parser} differs from Oxc at ${difference.path}: expected ${describe(difference.expected)}, actual ${describe(difference.actual)}`);
  }
}

export interface ParseCheck extends NormalizedParseResult {
  name: string;
}

export function assertMatchingParseErrors(results: ParseCheck[], file: string): void {
  const reference = results.find(result => result.name === "Oxc");
  if (!reference) throw new Error(`${file}: missing Oxc result`);
  for (const result of results) {
    if (result.diagnostics.length !== reference.diagnostics.length) {
      throw new Error(`${file}: ${result.name} parse errors differ from Oxc: expected ${reference.diagnostics.length}, actual ${result.diagnostics.length}; Oxc: ${reference.diagnostics.join("; ") || "none"}; ${result.name}: ${result.diagnostics.join("; ") || "none"}`);
    }
  }
  // Equal counts do not prove equivalent diagnostics. Invalid inputs must never
  // enter timing, even when all parsers reject them.
  if (reference.diagnostics.length) {
    throw new Error(`${file}: all parsers report parse errors; timing blocked. ${results.map(result => `${result.name}: ${result.diagnostics.join("; ")}`).join(" | ")}`);
  }
}

