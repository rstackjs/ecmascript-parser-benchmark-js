import assert from "node:assert/strict";
import test from "node:test";
import { createBenchmarkParserTasks } from "./benchmark-parsers.ts";
import { parserNamesFor } from "./parsers.ts";

test("benchmark tasks consume the AST without returning a parse-result wrapper", () => {
  for (const [source, lang] of [
    ["const value = obj?.field;", "js"],
    ["const value: number = 1;", "ts"],
    ["interface I { f(...arguments: unknown[]): void; }", "dts"],
    ["const value = <div />;", "jsx"],
    ["const value: unknown = <div />;", "tsx"],
  ] as const) {
    const tasks = createBenchmarkParserTasks(source, lang);
    assert.deepEqual(Object.keys(tasks), parserNamesFor(lang));
    for (const name of parserNamesFor(lang)) {
      assert.doesNotThrow(() => tasks[name]!.check(), `${lang}/${name}`);
      assert.equal(tasks[name]!.run(), undefined, `${lang}/${name}`);
    }
  }
});

test("benchmark options reject invalid input before timing", () => {
  const tasks = createBenchmarkParserTasks("const value = ;", "js");
  for (const name of parserNamesFor("js")) assert.throws(() => tasks[name]!.check(), name);
});

test("Babel recovery diagnostics are checked under the actual benchmark options", () => {
  const task = createBenchmarkParserTasks("const value: number;", "ts").Babel!;
  assert.doesNotThrow(() => task.run()); // Historical errorRecovery accepts a recovered AST.
  assert.throws(() => task.check(), /Parse diagnostics/);
});
