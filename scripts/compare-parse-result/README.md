# Compare parse results

Tools used by [`preflight.ts`](../preflight.ts) to normalize parser outputs and stop on the first difference. Run from the repository root:

```bash
pnpm preflight [fixture-key-or-file-path ...]
pnpm test:normalize
```

## Normalize a parse result

```ts
normalizeParseResult(output: ParseOutput, parser?: string): NormalizedParseResult
```

Import from [`normalize-parse-result.ts`](./normalize-parse-result.ts). `output` is the shared adapter result from [`parsers.ts`](../parsers.ts):

```ts
interface ParseOutput {
  program: unknown;
  comments: readonly FlatComment[] | null;
  diagnostics: string[];
}

interface NormalizedParseResult {
  ast: unknown;
  diagnostics: string[];
}
```

Pass the adapter's parser name. `"SWC"` dispatches to `normalizeSwcParseResult()`, `"Babel"` to `normalizeBabelParseResult()`, and other names use common ESTree normalization. Both specialized functions accept `ParseOutput` and return `NormalizedParseResult`; they can also be imported directly from their respective files.

Normalization removes node metadata, canonicalizes regex flags and BigInt values, and handles known defaults. SWC additionally converts its node schema. Input objects are not mutated. Diagnostics retain their wording after ANSI color codes are removed and whitespace is collapsed. A missing AST adds `"Returned no AST"` to diagnostics.

**Comparison scope:** Positions and comments are excluded. Child order, literal values, type annotations, and unknown fields are retained. Babel currently receives common normalization only; its structural conversion is deferred. Normalization never consults another parser's AST.

## Normalize a thrown error

```ts
normalizeParseFailure(error: unknown): NormalizedParseResult
```

Import from [`normalize-parse-result.ts`](./normalize-parse-result.ts). Returns `ast: undefined` and one normalized diagnostic based on the error message. Catch parser exceptions before calling `normalizeParseResult()`; normalization failures should propagate as tool errors.

## Find the first difference

```ts
firstDifference(expected: unknown, actual: unknown, path: string = "$"): Difference | undefined
compareObjects(expected: Record<string, unknown>, actual: Record<string, unknown>, path: string = "$"): Difference | undefined
```

Import from [`compare-parse-result.ts`](./compare-parse-result.ts). These functions compare supplied values without normalizing them. `firstDifference()` recursively compares arrays and objects; `compareObjects()` is its object-only entry point. Both return `undefined` when values match, otherwise:

```ts
interface Difference {
  path: string;
  expected: unknown;
  actual: unknown;
}
```

Object field order is ignored. An absent field is equivalent to `null`, `undefined`, or an empty array, except a `Literal` node's `value: null` must be present. Arrays preserve order, length, and null holes. Differences in array length use a path such as `$.body.length`; missing fields are displayed as `"<absent>"`.

## Assert matching ASTs

```ts
assertMatchingAst(reference: unknown, actual: unknown, file: string, parser: string): void
```

Import from [`compare-parse-result.ts`](./compare-parse-result.ts). Pass **already normalized** ASTs. Returns normally when they match, otherwise throws an error containing the file, parser, first differing path, and abbreviated values. The reference is labelled `Oxc` in the error.

## Check parse errors before comparing ASTs

```ts
assertMatchingParseErrors(results: ParseCheck[], file: string): void

interface ParseCheck extends NormalizedParseResult {
  name: string;
}
```

Import from [`compare-parse-result.ts`](./compare-parse-result.ts). `results` must include an entry named `"Oxc"`.

- Different diagnostic counts throw an error with both parsers' diagnostics.
- Nonzero matching counts also throw, preventing invalid inputs from entering timing.
- All zero counts pass. Equal counts do not prove equivalent diagnostic messages or error locations.

## Example

This example runs from the repository root and compares Oxc's default and raw transfer paths:

```js
import { createParserTasks } from "./scripts/parsers.ts";
import {
  normalizeParseResult,
  normalizeParseFailure,
} from "./scripts/compare-parse-result/normalize-parse-result.ts";
import {
  assertMatchingParseErrors,
  assertMatchingAst,
} from "./scripts/compare-parse-result/compare-parse-result.ts";

const tasks = createParserTasks("const value = 1;", "js");
const results = ["Oxc", "Oxc (raw transfer)"].map(name => {
  let output;
  try {
    output = tasks[name]();
  } catch (error) {
    return { name, ...normalizeParseFailure(error) };
  }
  return { name, ...normalizeParseResult(output, name) };
});

assertMatchingParseErrors(results, "example.js");
assertMatchingAst(results[0].ast, results[1].ast, "example.js", results[1].name);
```
