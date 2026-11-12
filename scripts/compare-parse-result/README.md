# Compare parse results

Two public functions are exported from `index.ts`:

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

Node metadata such as positions and comments is excluded. Known defaults, regex flags, BigInt values and SWC node representations are normalized. Child order, literal values, type annotations and unknown fields are retained. Diagnostics preserve wording after whitespace and ANSI colors are normalized.

## `compareParseResult(A, B)`

Accepts two normalized results. Returns normally when they match, otherwise throws an error with the first JSON path and differing values. Diagnostics are compared before ASTs, including their content, not just their count.

Object field order is ignored. Missing fields, `null` and empty arrays are equivalent, except `Literal.value: null` must be present. Array order and null holes are preserved. Different diagnostic wording remains a difference; normalization does not claim different parsers' errors mean the same thing.

Comparison only checks equality. [`preflight.ts`](../preflight.ts) separately blocks timing when matching results contain parse errors.

Run from the repository root:

```bash
pnpm preflight [fixture-key-or-file-path ...]
pnpm test:normalize
```
