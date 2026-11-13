import assert from "node:assert/strict";
import test from "node:test";
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
      assert.doesNotThrow(() => tasks[name]!.check(), `${lang}/${name}`);
      assert.equal(tasks[name]!.run(), undefined, `${lang}/${name}`);
    }
  }
});

test("benchmark options reject invalid input before timing", () => {
  const tasks = createParserTasks("const value = ;", "js", "benchmark");
  for (const name of parserNamesFor("js")) assert.throws(() => tasks[name]!.check(), name);
});

test("Babel recovery diagnostics are checked under the actual benchmark options", () => {
  const task = createParserTasks("const value: number;", "ts", "benchmark").Babel!;
  assert.doesNotThrow(() => task.run()); // Historical errorRecovery accepts a recovered AST.
  assert.throws(() => task.check(), /Parse diagnostics/);
});

test("repeated Acorn parses retain independent comment lists", () => {
  const parse = createParserTasks("/* comment */ const value = 1;", "js").Acorn!;
  const first = parse();
  const second = parse();
  assert.notEqual(first.comments, second.comments);
  assert.deepEqual(first.comments, second.comments);
  assert.equal(first.comments!.length, 1);
});
