import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createParserTasks, parserNamesFor, type ParseOutput, type ParserTask } from "../parsers.ts";
import { normalizeParseResult, compareParseResult } from "./index.ts";
import type { SourceLang } from "yuku";

const parseResult = (task: ParserTask) => task.toParseResult(task.run());

const fixtures = new URL("./fixtures/normalize/", import.meta.url);
const output = (program: unknown, diagnostics: string[] = [], comments: ParseOutput["comments"] = null): ParseOutput => ({ program, diagnostics, comments });

for (const file of (await readdir(fixtures)).sort()) {
  test(`parser outputs: ${file}`, async () => {
    const source = await readFile(new URL(file, fixtures), "utf-8");
    const lang: SourceLang = file.endsWith(".d.ts") ? "dts" : file.endsWith(".tsx") ? "tsx" : file.endsWith(".jsx") ? "jsx" : file.endsWith(".ts") ? "ts" : "js";
    const tasks = createParserTasks(source, lang);
    const results = parserNamesFor(lang).map(name => {
      const task = tasks[name]!;
      let parsed: unknown;
      try { parsed = task.run(); }
      catch (error) {
        const failure = output(undefined, [error instanceof Error ? error.message : String(error)]);
        return { name, ...normalizeParseResult(failure, name) };
      }
      // Adapter and normalization bugs must fail the test, not become diagnostics.
      return { name, ...normalizeParseResult(task.toParseResult(parsed), name) };
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
      if (result.name === "SWC") {
        assert.equal(result.comments, null, "SWC does not expose comments");
        assert.doesNotThrow(() => compareParseResult({ ...reference, comments: null }, result), result.name);
      } else assert.doesNotThrow(() => compareParseResult(reference, result), result.name);
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
      const a = normalizeParseResult(parseResult(leftTasks[parser]!), parser);
      const b = normalizeParseResult(parseResult(rightTasks[parser]!), parser);
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
    const original = parseResult(tasks[parser]!);
    const before = JSON.stringify(original);
    const first = normalizeParseResult(original, parser);
    assert.equal(JSON.stringify(original), before);
    assert.deepEqual(first, normalizeParseResult(original, parser));
    assert.deepEqual(first, normalizeParseResult(output(first.ast, first.diagnostics, first.comments)));
  }
});

test("SWC transport decoding preserves literal escapes and lone surrogates", () => {
  const tasks = createParserTasks(String.raw`const values = ["\uD800", "\\uD800", "\\\\u2028", "\\uGGGG", "\\u123", "\\n"];`, "js");
  const result = normalizeParseResult(parseResult(tasks.SWC!), "SWC");
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
  assert.doesNotThrow(() => compareParseResult(
    normalizeParseResult(output({ type: "Identifier", name: "x" }, ["\u001b[31mRecovered\n error\u001b[0m"])),
    normalizeParseResult(output({ type: "Identifier", name: "x" }, ["Recovered error"])),
  ));
  assert.throws(() => compareParseResult(a, b), /\$\.ast\.name/);
  assert.throws(() => compareParseResult(a, { ...a, diagnostics: ["error"] }), /\$\.diagnostics\.length/);
  assert.throws(() => compareParseResult({ ...a, diagnostics: ["first"] }, { ...a, diagnostics: ["second"] }), /\$\.diagnostics\[0\]/);
});

test("parse failures use the same normalizer without adding a duplicate error", () => {
  const parsed = output(undefined, ["\u001b[31mUnexpected\n token\u001b[0m"]);
  for (const parser of ["Oxc", "SWC", "Babel"]) {
    const result = normalizeParseResult(parsed, parser);
    assert.deepEqual(result, { ast: undefined, comments: null, diagnostics: ["Unexpected token"] });
    assert.doesNotThrow(() => compareParseResult(result, normalizeParseResult(output(undefined, ["Unexpected token"]), parser)));
    assert.deepEqual(normalizeParseResult(output(undefined), parser).diagnostics, ["Returned no AST"]);
  }
  assert.deepEqual(parsed.diagnostics, ["\u001b[31mUnexpected\n token\u001b[0m"]);
});

test("comments normalize type and metadata while retaining whitespace, content, and order", () => {
  const ast = { type: "Program", body: [] };
  const input = output(ast, [], [
    { type: "CommentLine", value: "  one  ", start: 0, end: 11 },
    { type: "CommentBlock", value: "* doc\r\n second ", start: 12, end: 30 },
    { type: "Line", value: "same", start: 31, end: 37 },
    { type: "Line", value: "same", start: 38, end: 44 },
  ]);
  const before = JSON.stringify(input);
  const result = normalizeParseResult(input, "Babel");
  assert.deepEqual(result.comments, [
    { type: "Line", value: "  one  " },
    { type: "Block", value: "* doc\r\n second " },
    { type: "Line", value: "same" },
    { type: "Line", value: "same" },
  ]);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(result, normalizeParseResult(output(result.ast, result.diagnostics, result.comments)));
  for (const comments of [
    result.comments!.slice(1),
    [...result.comments!].reverse(),
    [{ type: "Block", value: "  one  " }, ...result.comments!.slice(1)],
    [{ type: "Line", value: "one" }, ...result.comments!.slice(1)],
    null,
  ]) assert.throws(() => compareParseResult(result, normalizeParseResult(output(ast, [], comments))), /\$\.comments/);
  assert.throws(() => compareParseResult(normalizeParseResult(output(ast)), normalizeParseResult(output(ast, [], []))), /\$\.comments/);
});

test("all exposed parser comments match an independently specified list", () => {
  const tasks = createParserTasks('#!/usr/bin/env node\n//  one  \r\n/* two\r\n three */ const x=1; // last\n/** doc */', "js");
  for (const parser of parserNamesFor("js")) {
    const task = tasks[parser]!;
    const first = task.run();
    const second = task.run();
    // Inspection must use that run's result, even after another parse.
    const result = normalizeParseResult(task.toParseResult(first), parser);
    assert.deepEqual(result, normalizeParseResult(task.toParseResult(second), parser));
    assert.deepEqual(result.comments, parser === "SWC" ? null : [
      { type: "Line", value: "  one  " },
      { type: "Block", value: " two\r\n three " },
      { type: "Line", value: " last" },
      { type: "Block", value: "* doc " },
    ], parser);
  }
});
