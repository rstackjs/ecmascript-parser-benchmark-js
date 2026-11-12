import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createParserTasks, parserNamesFor, type ParseOutput } from "../parsers.ts";
import { normalizeParseResult, compareParseResult } from "./index.ts";
import type { SourceLang } from "yuku";

const fixtures = new URL("./fixtures/normalize/", import.meta.url);
const output = (program: unknown, diagnostics: string[] = []): ParseOutput => ({ program, diagnostics, comments: null });

for (const file of (await readdir(fixtures)).sort()) {
  test(`parser outputs: ${file}`, async () => {
    const source = await readFile(new URL(file, fixtures), "utf-8");
    const lang: SourceLang = file.endsWith(".d.ts") ? "dts" : file.endsWith(".tsx") ? "tsx" : file.endsWith(".jsx") ? "jsx" : file.endsWith(".ts") ? "ts" : "js";
    const tasks = createParserTasks(source, lang);
    const results = parserNamesFor(lang).map(name => {
      // Keep normalization outside this catch: adapter bugs must fail the test.
      let parsed: ParseOutput;
      try { parsed = tasks[name]!(); }
      catch (error) { parsed = output(undefined, [error instanceof Error ? error.message : String(error)]); }
      return { name, ...normalizeParseResult(parsed, name) };
    });
    if (file.startsWith("invalid-")) {
      if (file === "invalid-export.js") {
        // Acorn and Babel check unresolved exports during parsing; native parsers
        // leave that check to semantic analysis. The preflight must expose it.
        for (const result of results) {
          if (["Acorn", "Babel"].includes(result.name)) assert.ok(result.diagnostics.length, result.name);
          else assert.equal(result.diagnostics.length, 0, result.name);
        }
        assert.throws(() => compareParseResult(results.find(result => result.name === "Oxc")!, results.find(result => result.name === "Acorn")!), /diagnostics/);
      } else {
        for (const result of results) assert.ok(result.diagnostics.length, result.name);

      }
      return;
    }
    for (const result of results) assert.equal(result.diagnostics.length, 0, result.name);
    const reference = results.find(result => result.name === "Oxc")!;
    for (const result of results.filter(result => result.name !== "Oxc")) {
      assert.doesNotThrow(() => compareParseResult(reference, result), result.name);
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
    for (const parser of parserNamesFor(lang)) {
      const a = normalizeParseResult(leftTasks[parser]!(), parser);
      const b = normalizeParseResult(rightTasks[parser]!(), parser);
      assert.equal(a.diagnostics.length, 0);
      assert.equal(b.diagnostics.length, 0);
      assert.throws(() => compareParseResult(a, b), `${parser} lost difference between ${left} and ${right}`);
    }
  }
  assert.throws(() => compareParseResult(normalizeParseResult(output({ type: "Literal", value: null })), normalizeParseResult(output({ type: "Literal" }))));
  assert.throws(() => compareParseResult(normalizeParseResult(output({ type: "NewNode", unknown: "a" })), normalizeParseResult(output({ type: "NewNode", unknown: "b" }))));
  assert.equal((normalizeParseResult(output({ type: "Payload", value: { raw: "keep", start: 1 } })).ast as { value: { raw: string } }).value.raw, "keep");
});

test("the public normalizer dispatches Babel ASTs and diagnostics to its adapter", () => {
  const parsed = output({ type: "StringLiteral", value: "x", start: 0 }, ["\u001b[31mUnexpected\n token\u001b[0m"]);
  const result = normalizeParseResult(parsed, "Babel");
  assert.deepEqual(result.diagnostics, ["Unexpected token"]);
  assert.equal((result.ast as { type: string }).type, "Literal");
  assert.deepEqual(parsed.diagnostics, ["\u001b[31mUnexpected\n token\u001b[0m"]);
});

test("normalization is deterministic, idempotent, and leaves parser outputs intact", () => {
  const tasks = createParserTasks('"use strict"; const x = { key: 1, ...other };', "js");
  for (const parser of ["Babel", "SWC"]) {
    const original = tasks[parser]!();
    const before = JSON.stringify(original);
    const first = normalizeParseResult(original, parser);
    assert.equal(JSON.stringify(original), before);
    assert.deepEqual(first, normalizeParseResult(original, parser));
    assert.deepEqual(first, normalizeParseResult(output(first.ast, first.diagnostics)));
  }
});

test("SWC transport decoding preserves literal escapes and lone surrogates", () => {
  const tasks = createParserTasks(String.raw`const values = ["\uD800", "\\uD800", "\\\\u2028", "\\uGGGG", "\\u123", "\\n"];`, "js");
  const result = normalizeParseResult(tasks.SWC!(), "SWC");
  const ast = result.ast as { body: { declarations: { init: { elements: { value: string }[] } }[] }[] };
  assert.deepEqual(ast.body[0]!.declarations[0]!.init.elements.map(node => node.value),
    ["\uD800", "\\uD800", "\\\\u2028", "\\uGGGG", "\\u123", "\\n"]);
  assert.throws(() => compareParseResult(
    normalizeParseResult(output({ type: "StringLiteral", value: "\\uD800" }), "SWC"),
    normalizeParseResult(output({ type: "StringLiteral", value: "\\\\uD800" }), "SWC")), /value/);
});

test("JSX entities decode once without hiding unexpected value differences", () => {
  const raw = "&amp;amp; &#38; &#x26; &unknown;\n  ";
  const cooked = "&amp; & & &unknown;\n  ";
  const a = normalizeParseResult(output({ type: "JSXText", raw, value: raw }));
  const b = normalizeParseResult(output({ type: "JSXText", raw, value: cooked }));
  assert.deepEqual((a.ast as { value: string }).value, cooked);
  assert.doesNotThrow(() => compareParseResult(a, b));
  assert.deepEqual(a, normalizeParseResult(output(a.ast)));
  assert.throws(() => compareParseResult(a, normalizeParseResult(output({ type: "JSXText", raw, value: "wrong" }))), /value/);
});

test("public API compares ASTs and diagnostic content", () => {
  const a = normalizeParseResult(output({ type: "Identifier", name: "x" }));
  const b = normalizeParseResult(output({ type: "Identifier", name: "y" }));
  assert.doesNotThrow(() => compareParseResult(a, a));
  assert.throws(() => compareParseResult(a, b), /\$\.ast\.name/);
  assert.throws(() => compareParseResult(a, { ...a, diagnostics: ["error"] }), /\$\.diagnostics\.length/);
  assert.throws(() => compareParseResult({ ...a, diagnostics: ["first"] }, { ...a, diagnostics: ["second"] }), /\$\.diagnostics\[0\]/);
});

test("parse failures use the same normalizer without adding a duplicate error", () => {
  const parsed = output(undefined, ["\u001b[31mUnexpected\n token\u001b[0m"]);
  for (const parser of ["Oxc", "SWC", "Babel"]) {
    const result = normalizeParseResult(parsed, parser);
    assert.deepEqual(result, { ast: undefined, diagnostics: ["Unexpected token"] });
    assert.doesNotThrow(() => compareParseResult(result, normalizeParseResult(output(undefined, ["Unexpected token"]), parser)));
    assert.deepEqual(normalizeParseResult(output(undefined), parser).diagnostics, ["Returned no AST"]);
  }
  assert.deepEqual(parsed.diagnostics, ["\u001b[31mUnexpected\n token\u001b[0m"]);
});
