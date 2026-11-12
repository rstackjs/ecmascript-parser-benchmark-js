import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createParserTasks, parserNamesFor, type ParseOutput } from "./parsers.ts";
import { normalizeAst, normalizeParseFailure, normalizeParseResult } from "./normalize-parse-result.ts";
import { normalizeBabelParseResult } from "./normalize-babel-parse-result.ts";
import { assertMatchingParseErrors, firstDifference } from "./compare-parse-result.ts";
import type { SourceLang } from "yuku";

const fixtures = new URL("./fixtures/normalize/", import.meta.url);
const output = (program: unknown, diagnostics: string[] = []): ParseOutput => ({ program, diagnostics, comments: null });

// These differences must remain visible: do not change AST values to match Oxc.
const VALUE_DIFFERENCES: Record<string, { parsers: string[]; expected: string; actual: string }> = {
  "escaped-unicode.js": { parsers: ["SWC"], expected: "\\u2028", actual: "\\\\u2028" },
  "jsx-spaces.jsx": { parsers: ["SWC", "Yuku"], expected: "\n  hello &amp; world\n  ", actual: "\n  hello & world\n  " },
};

for (const file of (await readdir(fixtures)).sort()) {
  test(`parser outputs: ${file}`, async () => {
    const source = await readFile(new URL(file, fixtures), "utf-8");
    const lang: SourceLang = file.endsWith(".d.ts") ? "dts" : file.endsWith(".tsx") ? "tsx" : file.endsWith(".jsx") ? "jsx" : file.endsWith(".ts") ? "ts" : "js";
    const tasks = createParserTasks(source, lang);
    // Babel's structural conversion is intentionally outside this test matrix.
    const results = parserNamesFor(lang).filter(name => name !== "Babel").map(name => {
      // Keep normalization outside this catch: adapter bugs must fail the test.
      let parsed: ParseOutput;
      try { parsed = tasks[name]!(); }
      catch (error) { return { name, ...normalizeParseFailure(error) }; }
      return { name, ...normalizeParseResult(parsed, name) };
    });
    if (file.startsWith("invalid-")) {
      if (file === "invalid-export.js") {
        // Acorn checks unresolved exports during parsing; the native parsers
        // leave that check to semantic analysis. The preflight must expose it.
        assert.ok(results.find(result => result.name === "Acorn")!.diagnostics.length);
        for (const result of results.filter(result => result.name !== "Acorn")) assert.equal(result.diagnostics.length, 0, result.name);
        assert.throws(() => assertMatchingParseErrors(results, file), /parse errors differ/);
      } else {
        for (const result of results) assert.ok(result.diagnostics.length, result.name);
        assert.throws(() => assertMatchingParseErrors(results, file), /timing blocked/);
      }
      return;
    }
    assertMatchingParseErrors(results, file);
    const reference = results.find(result => result.name === "Oxc")!;
    for (const result of results.filter(result => result.name !== "Oxc")) {
      const difference = firstDifference(reference.ast, result.ast);
      const knownDifference = VALUE_DIFFERENCES[file];
      if (knownDifference?.parsers.includes(result.name)) {
        assert.ok(difference, `${result.name} must retain the value difference`);
        assert.match(difference.path, /\.value$/);
        assert.equal(difference.expected, knownDifference.expected);
        assert.equal(difference.actual, knownDifference.actual);
      } else {
        assert.equal(difference, undefined, `${result.name}: ${difference?.path}`);
      }
    }
  });
}

test("normalization preserves values, child order, optionality, and unknown fields", () => {
  const sources = [
    ["const x = 1;", "const x = 2;", "js"],
    ["const x = null;", "const x = false;", "js"],
    ["const x = [a, b];", "const x = [b, a];", "js"],
    ["const x = [a, , b];", "const x = [a, b];", "js"],
    ["const x = /a/g;", "const x = /b/g;", "js"],
    ["const x = /a/g;", "const x = /a/i;", "js"],
    ["const x = obj.x;", "const x = obj?.x;", "js"],
    ["const x = (obj?.x).y;", "const x = obj?.x.y;", "js"],
    ["const x = 1n;", "const x = 2n;", "js"],
    ["const x = tag`\\n`;", "const x = tag`\n`;", "js"],
    ["const x: string = value;", "const x: number = value;", "ts"],
    ["class C { private x: number; }", "class C { public x: number; }", "ts"],
  ] as const;
  for (const [left, right, lang] of sources) {
    const leftTasks = createParserTasks(left, lang);
    const rightTasks = createParserTasks(right, lang);
    for (const parser of parserNamesFor(lang).filter(name => name !== "Babel")) {
      const a = normalizeParseResult(leftTasks[parser]!(), parser);
      const b = normalizeParseResult(rightTasks[parser]!(), parser);
      assert.equal(a.diagnostics.length, 0);
      assert.equal(b.diagnostics.length, 0);
      assert.ok(firstDifference(a.ast, b.ast), `${parser} lost difference between ${left} and ${right}`);
    }
  }
  assert.ok(firstDifference(normalizeAst({ type: "Literal", value: null }), normalizeAst({ type: "Literal" })));
  assert.ok(firstDifference(normalizeAst({ type: "NewNode", unknown: "a" }), normalizeAst({ type: "NewNode", unknown: "b" })));
  assert.equal((normalizeAst({ type: "Payload", value: { raw: "keep", start: 1 } }) as { value: { raw: string } }).value.raw, "keep");
});

test("Babel normalizes a complete result through its own entry point", () => {
  const parsed = output({ type: "StringLiteral", value: "x", start: 0 }, ["\u001b[31mUnexpected\n token\u001b[0m"]);
  const result = normalizeBabelParseResult(parsed);
  assert.deepEqual(result.diagnostics, ["Unexpected token"]);
  assert.equal((result.ast as { type: string }).type, "StringLiteral");
  assert.deepEqual(result, normalizeParseResult(parsed, "Babel"));
  assert.deepEqual(parsed.diagnostics, ["\u001b[31mUnexpected\n token\u001b[0m"]);
});

test("normalization is deterministic, idempotent, and leaves parser outputs intact", () => {
  const original = createParserTasks("const x = { key: 1, ...other };", "js").SWC!();
  const before = JSON.stringify(original);
  const first = normalizeParseResult(original, "SWC");
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(first, normalizeParseResult(original, "SWC"));
  assert.deepEqual(first.ast, normalizeAst(first.ast));
});
