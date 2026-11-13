import type { FlatComment, ParseOutput } from "./parse-result.ts";
import { isRecord } from "./normalize-ast.ts";

/** Preserve comment content and source order; omit location metadata. */
export function normalizeComments(output: ParseOutput): Pick<FlatComment, "type" | "value">[] | null {
  if (output.comments === null) return null; // Unavailable, not an empty list.
  const program = isRecord(output.program) ? output.program : undefined;
  const hashbang = program?.hashbang ?? program?.interpreter;
  const hashbangValue = typeof hashbang === "string" ? hashbang : isRecord(hashbang) ? hashbang.value : undefined;
  return output.comments.flatMap(comment => {
    const type = comment.type === "CommentLine" ? "Line" : comment.type === "CommentBlock" ? "Block" : comment.type;
    // Acorn/Oxc also expose the hashbang as a line comment. It is compared in AST.
    if (type === "Line" && comment.start === 0 && comment.value === hashbangValue) return [];
    return [{ type, value: comment.value }];
  });
}
