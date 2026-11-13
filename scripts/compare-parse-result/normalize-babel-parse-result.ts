import type { ParseOutput } from "./parse-result.ts";
import { isRecord, normalizeAst } from "./normalize-ast.ts";
import { resultWithAst, type NormalizedParseResult } from "./parse-result.ts";

type Node = Record<string, unknown>;
const LITERALS = new Set(["StringLiteral", "NumericLiteral", "BooleanLiteral", "NullLiteral", "BigIntLiteral", "RegExpLiteral"]);
const FUNCTION_FIELDS = ["id", "params", "body", "async", "generator", "typeParameters", "returnType"];

function rename(node: Node, from: string, to: string) {
  if (Object.hasOwn(node, from)) { node[to] = node[from]; delete node[from]; }
}

/** Convert Babel node schemas independently of the other parsers' output. */
function normalizeBabelAst(ast: unknown): unknown {
  function visit(value: unknown, inChain = false): unknown {
    if (Array.isArray(value)) return value.map(item => visit(item));
    if (!isRecord(value)) return value;
    const node: Node = { ...value };
    const originalType = node.type;
    let chain = false;
    if (typeof originalType === "string") {
      if (LITERALS.has(originalType)) {
        node.type = "Literal";
        if (originalType === "NullLiteral") node.value = null;
        if (originalType === "BigIntLiteral") { node.bigint = node.value; delete node.value; }
        if (originalType === "RegExpLiteral") {
          node.regex = { pattern: node.pattern, flags: node.flags };
          delete node.pattern; delete node.flags;
        }
      } else if (originalType === "PrivateName" && isRecord(node.id)) {
        node.type = "PrivateIdentifier"; node.name = node.id.name; delete node.id;
      } else if (["ClassProperty", "ClassPrivateProperty", "ClassAccessorProperty"].includes(originalType)) {
        node.type = originalType === "ClassAccessorProperty" ? "AccessorProperty" : node.abstract ? "TSAbstractPropertyDefinition" : "PropertyDefinition";
        if (node.abstract) delete node.abstract; // Encoded in TSAbstractPropertyDefinition.
      } else if (["ObjectMethod", "ClassMethod", "ClassPrivateMethod", "TSDeclareMethod"].includes(originalType)) {
        const fn: Node = { type: originalType === "TSDeclareMethod" ? "TSEmptyBodyFunctionExpression" : "FunctionExpression" };
        for (const field of FUNCTION_FIELDS) {
          if (Object.hasOwn(node, field)) fn[field] = node[field];
          delete node[field];
        }
        node.value = fn;
        if (originalType === "ObjectMethod") {
          node.type = "Property";
          node.method = node.kind === "method";
          if (node.kind === "method") node.kind = "init";
        } else {
          node.type = node.abstract ? "TSAbstractMethodDefinition" : "MethodDefinition";
          if (node.abstract) delete node.abstract;
        }
      } else if (originalType === "ObjectProperty") {
        node.type = "Property"; node.kind = "init";
      } else if (originalType === "OptionalMemberExpression" || originalType === "OptionalCallExpression") {
        node.type = originalType === "OptionalMemberExpression" ? "MemberExpression" : "CallExpression";
        chain = true;
      } else if (originalType === "TSNonNullExpression") {
        // Non-null assertions can continue an optional chain without ending it.
        let expression = node.expression;
        while (isRecord(expression) && expression.type === "TSNonNullExpression") expression = expression.expression;
        chain = isRecord(expression) && ["OptionalMemberExpression", "OptionalCallExpression"].includes(String(expression.type));
      } else if (originalType === "Program") {
        rename(node, "interpreter", "hashbang");
        if (isRecord(node.hashbang)) node.hashbang = { ...node.hashbang, type: "Hashbang" };
      } else if (originalType === "StaticBlock" && isRecord(node.body)) {
        node.body = node.body.body;
      } else if (originalType === "ExportNamedDeclaration" && Array.isArray(node.specifiers) && node.specifiers.length === 1 && isRecord(node.specifiers[0]) && node.specifiers[0].type === "ExportNamespaceSpecifier") {
        node.type = "ExportAllDeclaration"; node.exported = node.specifiers[0].exported; delete node.specifiers;
      }
      if ((originalType === "Program" || originalType === "BlockStatement") && Array.isArray(node.directives)) {
        const directives = node.directives.map(directive => {
          if (!isRecord(directive) || !isRecord(directive.value)) throw new Error("Unsupported Babel directive representation");
          const literal = directive.value;
          const cooked = isRecord(literal.extra) ? literal.extra.expressionValue : undefined;
          return { ...directive, type: "ExpressionStatement", directive: literal.value,
            expression: { ...literal, type: "Literal", value: cooked ?? literal.value }, value: undefined };
        });
        node.body = [...directives, ...(Array.isArray(node.body) ? node.body : [])];
        delete node.directives;
      }
    }
    const result: Node = Object.create(null);
    for (const [field, item] of Object.entries(node)) {
      const continuesChain = (node.type === "MemberExpression" && field === "object")
        || (node.type === "CallExpression" && field === "callee")
        || (node.type === "TSNonNullExpression" && field === "expression");
      result[field] = visit(item, (chain || inChain) && continuesChain);
    }
    return chain && !inChain ? { type: "ChainExpression", expression: result } : result;
  }
  return normalizeAst(visit(ast));
}

/** Babel's structural and diagnostic adapters have their own entry point. */
export function normalizeBabelParseResult(output: ParseOutput): NormalizedParseResult {
  return resultWithAst(normalizeBabelAst(output.program), output);
}
