# Compare parse results

The complete public API is exported from `index.ts`: `normalizeParseResult`, `compareParseResult`, and the `NormalizedParseResult` TypeScript type. Other files contain implementation helpers.

```ts
import {
  normalizeParseResult,
  compareParseResult,
} from "./scripts/compare-parse-result/index.ts";

const A = normalizeParseResult(outputA, "Oxc");
const B = normalizeParseResult(outputB, "SWC");

compareParseResult(A, B); // Throws on the first difference.
```

## `normalizeParseResult(output, parser?)`

Accepts the shared parser adapter output from [`parsers.ts`](../parsers.ts):

```ts
{
  program: unknown,
  comments: readonly FlatComment[] | null,
  diagnostics: string[]
}
```

Returns `{ ast: unknown, diagnostics: string[] }` without mutating the input. Pass the parser name to select its normalization: `"SWC"` and `"Babel"` have separate adapters; other parsers use common ESTree normalization. Babel's structural conversion is currently deferred.

If a parser throws, put its error message in `diagnostics` and use `program: undefined`, then call this same function. Existing diagnostics are retained; a missing AST without diagnostics produces `"Returned no AST"`. Exceptions from normalization itself propagate to the caller.

```ts
const failure = normalizeParseResult({
  program: undefined,
  comments: null,
  diagnostics: ["Unexpected token"],
}, "Babel");
// { ast: undefined, diagnostics: ["Unexpected token"] }
```

Node metadata such as positions and comments is excluded. Known defaults, regex flags, BigInt values and SWC node representations are normalized. Child order, literal values, type annotations and unknown fields are retained. Diagnostics preserve wording after whitespace and ANSI colors are normalized.

## `compareParseResult(A, B)`

Accepts two normalized results. Returns normally when they match, otherwise throws an error with the first JSON path and differing values. Diagnostics are compared before ASTs, including their content, not just their count.

Object field order is ignored. Missing fields, `null` and empty arrays are equivalent, except `Literal.value: null` must be present. Array order and null holes are preserved. Different diagnostic wording remains a difference; normalization does not claim different parsers' errors mean the same thing.

Comparison only checks equality. [`preflight.ts`](../preflight.ts) separately blocks timing when matching results contain parse errors.

## `NormalizedParseResult`

The return type of `normalizeParseResult` and input type of `compareParseResult`. It can be imported with `import type { NormalizedParseResult } from "./scripts/compare-parse-result/index.ts"`:

```ts
interface NormalizedParseResult {
  ast: unknown;
  diagnostics: string[];
}
```

Run from the repository root:

```bash
pnpm preflight [fixture-key-or-file-path ...]
pnpm test:normalize
```
