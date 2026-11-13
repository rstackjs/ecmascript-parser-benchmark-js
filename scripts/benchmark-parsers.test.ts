import assert from "node:assert/strict";
import test from "node:test";
import * as babel from "@babel/parser";
import * as oxc from "oxc-parser";
import { createParserTasks, parserNamesFor } from "./parsers.ts";

test("benchmark tasks consume the AST without returning a parse-result wrapper", () => {
  for (const [source, lang] of [
    ["const value = obj?.field;", "js"],
    ["const value: number = 1;", "ts"],
    ["interface I { f(...arguments: unknown[]): void; }", "dts"],
    ["const value = <div />;", "jsx"],
    ["const value: unknown = <div />;", "tsx"],
  ] as const) {
    const tasks = createParserTasks(source, lang, "benchmark");
    assert.deepEqual(Object.keys(tasks), parserNamesFor(lang));
    for (const name of parserNamesFor(lang)) {
      assert.equal(tasks[name]!(), undefined, `${lang}/${name}`);
    }
  }
});

test("benchmark callbacks allow parser results with diagnostics", () => {
  const source = "const value: number;";
  assert.ok(babel.parse(source, { sourceType: "module", plugins: ["typescript"], errorRecovery: true }).errors!.length);
  assert.ok(oxc.parseSync("bench.ts", source).errors.length);
  const tasks = createParserTasks(source, "ts", "benchmark");
  for (const name of ["Babel", "Oxc", "Oxc (raw transfer)"]) assert.doesNotThrow(() => tasks[name]!(), name);
});

test("repeated Acorn parses retain independent comment lists", () => {
  const parse = createParserTasks("/* comment */ const value = 1;", "js").Acorn!;
  const first = parse();
  const second = parse();
  assert.notEqual(first.comments, second.comments);
  assert.deepEqual(first.comments, second.comments);
  assert.equal(first.comments!.length, 1);
});
