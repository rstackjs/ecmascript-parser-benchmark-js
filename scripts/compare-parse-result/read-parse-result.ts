import type { parse as babelParse } from "@babel/parser";
import type { ParseResult as OxcResult } from "oxc-parser";
import type { ParseResult as SwcNextResult } from "@swc-next/parser";
import type { parse as yukuParse } from "yuku";
import { isRecord } from "./normalize-ast.ts";
import type { FlatComment, ParseOutput } from "./parse-result.ts";

/** Read native parser results here, never in the timed parser callbacks. */
export function readParseResult(result: unknown, parser?: string, source?: string): ParseOutput {
  if (!isRecord(result)) throw new TypeError("Expected a parser result object");
  // Also accept the common shape for callers supplying diagnostics or test ASTs.
  if ("program" in result && Array.isArray(result.diagnostics)
    && result.diagnostics.every(message => typeof message === "string")) {
    return result as unknown as ParseOutput;
  }

  switch (parser) {
    case "Acorn": {
      const comments = (result.comments ?? null) as readonly FlatComment[] | null;
      // Only #! is a hashbang; a normal // comment at offset zero is not.
      const hashbang = source?.startsWith("#!")
        ? comments?.find(comment => comment.start === 0)
        : undefined;
      return {
        program: hashbang
          ? { ...result, hashbang: { type: "Hashbang", value: hashbang.value } }
          : result,
        comments,
        diagnostics: [],
      };
    }
    case "Babel": {
      const parsed = result as unknown as ReturnType<typeof babelParse>;
      return {
        program: parsed.program,
        comments: parsed.comments ?? [],
        diagnostics: (parsed.errors ?? []).map(error => error!.message),
      };
    }
    case "Oxc":
    case "Oxc (raw transfer)": {
      const parsed = result as unknown as OxcResult;
      return {
        program: parsed.program,
        comments: parsed.comments,
        diagnostics: parsed.errors.map(error => error.message),
      };
    }
    case "SWC":
      return { program: result, comments: null, diagnostics: [] };
    case "SWC Next": {
      const parsed = result as unknown as SwcNextResult;
      return {
        program: parsed.program,
        comments: parsed.comments,
        diagnostics: parsed.diagnostics
          .filter(diagnostic => diagnostic.severity === "error")
          .map(diagnostic => diagnostic.message),
      };
    }
    case "Yuku": {
      const parsed = result as unknown as ReturnType<typeof yukuParse>;
      return {
        program: parsed.program,
        comments: parsed.comments,
        diagnostics: parsed.diagnostics.map(
          diagnostic => `${diagnostic.message} at [${diagnostic.start}, ${diagnostic.end})`,
        ),
      };
    }
    default:
      throw new TypeError(`Unsupported parser result: ${parser ?? "parser name required"}`);
  }
}
