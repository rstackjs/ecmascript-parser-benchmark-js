import type { Comment } from "acorn";

// Associate each parse with its comments without modifying or retaining its AST.
export const acornComments = new WeakMap<object, readonly Comment[]>();
