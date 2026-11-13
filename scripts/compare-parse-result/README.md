# Compare parse results

The complete public API is exported from `index.ts`: `normalizeParseResult`, `compareParseResult`, and the `NormalizedParseResult` TypeScript type. Other files contain implementation helpers.

```ts
import {
  normalizeParseResult,
  compareParseResult,
} from "./scripts/compare-parse-result/index.ts";

const A = normalizeParseResult(oxcResult, "Oxc");
const B = normalizeParseResult(swcResult, "SWC");

compareParseResult(A, B); // Throws on the first difference.
```

## `normalizeParseResult(result, parser?, source?)`

Accepts the original result returned by Acorn, Babel, Oxc, Oxc (raw transfer), SWC, SWC Next or Yuku. Pass the parser name to read its AST, comments and diagnostics. Acorn returns its Program directly; tasks in [`parsers.ts`](../parsers.ts) collect comments through `onComment` and associate them with that Program in an internal `WeakMap`. The normalizer retrieves them without adding fields to the AST. Acorn results created outside these tasks have unavailable comments unless provided in the common shape below. Pass the original `source` for Acorn to normalize hashbang metadata that its AST omits. The original result is not modified.

Also accepts the common shape below, for example when reporting a thrown parser error or normalizing a synthetic AST. The parser name is optional for this shape; pass `"Babel"` or `"SWC"` when its AST uses that parser's schema.

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

[`preflight.ts`](../preflight.ts) checks equality: matching results pass even when diagnostics are nonempty. Different diagnostic content still fails. `@swc/core` does not expose comments in its original return value; preflight explicitly reports that SWC is checked for AST and diagnostics only. All other parsers' comments, including Acorn's collected list, are compared.

[`parsers.ts`](../parsers.ts) defines each parser call and its options once. Preflight and benchmark call the same function: it parses, reads the AST to include JavaScript AST construction, and returns the original result. Preflight passes that result directly to `normalizeParseResult(result, parser, source)`. All result adaptation and comparison live in this directory, outside benchmark timing.

Parser options are written alongside each call. Both callers use module parsing for JS/TS/JSX/TSX and script parsing for declaration files. Parsers retain explicit parentheses where supported. Acorn collects a fresh comment list per parse and records it in a `WeakMap`; both operations are timed, and the map does not retain otherwise unreachable ASTs. Parsers with lazy ASTs still access `program` before returning to include JavaScript AST construction in the measured time; lazy comment/diagnostic access is left to preflight. Any work performed by the parser itself remains part of the measured time.

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
