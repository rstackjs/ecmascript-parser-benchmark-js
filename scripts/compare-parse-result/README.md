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

Returns `{ ast: unknown, comments: readonly { type: string, value: string }[] | null, diagnostics: string[] }` without mutating the input. Pass the parser name to select its normalization: `"SWC"` and `"Babel"` have separate adapters; other parsers use common ESTree normalization. Babel converts literal nodes, object/class members, directives, optional chains and namespace exports into ESTree representations. Unknown nodes and fields remain visible in comparisons.

If a parser throws, put its error message in `diagnostics` and use `program: undefined`, then call this same function. Existing diagnostics are retained; a missing AST without diagnostics produces `"Returned no AST"`. Exceptions from normalization itself propagate to the caller.

```ts
const failure = normalizeParseResult({
  program: undefined,
  comments: null,
  diagnostics: ["Unexpected token"],
}, "Babel");
// { ast: undefined, comments: null, diagnostics: ["Unexpected token"] }
```

Node metadata such as positions and comments is excluded. Known defaults, regex flags, BigInt values and SWC node representations are normalized. SWC's string transport encoding is decoded, including lone surrogates and escaped `\uXXXX` text. JSX text and quoted attribute values use one pass of entity decoding, preserving whitespace and unknown entities. Child order, literal values, type annotations and unknown fields are retained. Diagnostics preserve wording after whitespace and ANSI colors are normalized.

The separate `comments` list maps Babel's `CommentLine`/`CommentBlock` to `Line`/`Block` and removes locations. Content, whitespace, line endings, duplicates and source order are preserved. A hashbang also emitted as a comment is omitted from this list because it is compared in the AST. `null` means comments were unavailable; `[]` means the parser returned no comments.

## `compareParseResult(A, B)`

Accepts two normalized results. Returns normally when they match, otherwise throws an error with the first JSON path and differing values. Compares diagnostics, then ASTs, then comments, including their content, not just their count. `comments: null` differs from any provided list, including `[]`.

Object field order is ignored. Within AST objects, missing fields, `null` and empty arrays are equivalent, except `Literal.value: null` must be present. Array order and null holes are preserved. Different diagnostic wording remains a difference; normalization does not claim different parsers' errors mean the same thing.

Comparison only checks equality. [`preflight.ts`](../preflight.ts) separately blocks timing when matching results contain parse errors. `@swc/core`'s `parseSync` does not expose collected comments; preflight explicitly reports that SWC is checked for AST and diagnostics only. Other parsers' comments are compared.

The comparison adapters expose full results and explicit parenthesized nodes for cross-parser checks. Timings use [`benchmark-parsers.ts`](../benchmark-parsers.ts), which preserves the original benchmark options and reads only the AST. Each benchmark child checks diagnostics with its actual benchmark options before starting Tinybench. Comment/diagnostic decoding and normalization are not timed.

## `NormalizedParseResult`

The return type of `normalizeParseResult` and input type of `compareParseResult`. It can be imported with `import type { NormalizedParseResult } from "./scripts/compare-parse-result/index.ts"`:

```ts
interface NormalizedParseResult {
  ast: unknown;
  comments: readonly { type: string; value: string }[] | null;
  diagnostics: string[];
}
```

Run from the repository root:

```bash
pnpm preflight [fixture-key-or-file-path ...]
pnpm test:normalize
```
