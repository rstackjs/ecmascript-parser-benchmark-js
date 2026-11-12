import { isRecord, normalizeAst } from "./normalize-ast.ts";

type Node = Record<string, unknown>;
const LITERALS = new Set(["StringLiteral", "NumericLiteral", "BooleanLiteral", "NullLiteral", "BigIntLiteral", "RegExpLiteral"]);
const TS_FIELDS: Record<string, Record<string, string>> = {
  TSTypeReference: { typeParams: "typeArguments" },
  TSTypeParameterDeclaration: { parameters: "params" },
  TSMethodSignature: { typeAnn: "returnType", typeParams: "typeParameters" },
  TSCallSignatureDeclaration: { typeAnnotation: "returnType", typeParams: "typeParameters" },
  TSConstructSignatureDeclaration: { typeAnnotation: "returnType", typeParams: "typeParameters" },
  TSFunctionType: { typeAnnotation: "returnType", typeParams: "typeParameters" },
  TSConstructorType: { typeAnnotation: "returnType", typeParams: "typeParameters" },
  TSTupleType: { elemTypes: "elementTypes" }, TSArrayType: { elemType: "elementType" },
  TSTypeOperator: { op: "operator" }, TSParameterProperty: { param: "parameter" },
  TSImportType: { argument: "source", attributes: "options" },
  TSEnumMember: { init: "initializer" },
  TSIndexSignature: { params: "parameters" },
  TSTypePredicate: { paramName: "parameterName" },
};
function rename(node: Node, from: string, to: string) {
  if (Object.hasOwn(node, from)) { node[to] = node[from]; delete node[from]; }
}
function functionValue(node: Node): Node {
  const result: Node = { type: "FunctionExpression" };
  for (const key of ["params", "body", "async", "generator", "typeParameters", "returnType", "decorators", "thisParam"]) {
    if (Object.hasOwn(node, key)) result[key] = node[key];
  }
  return result;
}
function property(node: Node, kind = "init"): Node {
  return { ...node, type: "Property", kind, computed: isRecord(node.key) && node.key.type === "Computed" };
}
function attributes(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.properties)) return value;
  return value.properties.map(item => isRecord(item) && item.type === "KeyValueProperty"
    ? { type: "ImportAttribute", key: item.key, value: item.value } : item);
}

/** Schema conversions are keyed by SWC node type, never by fixture or Oxc output. */
export function normalizeSwcAst(ast: unknown): unknown {
  function visit(value: unknown, parentType?: string, key?: string, inChain = false): unknown {
    if (Array.isArray(value)) return value.map(item => visit(item, parentType, key, inChain));
    if (!isRecord(value)) return value;
    let node: Node = { ...value };
    const originalType = node.type;
    if (typeof originalType !== "string") {
      // SWC ExprOrSpread wrappers in call/new arguments and array elements.
      if ((key === "arguments" || key === "elements") && Object.hasOwn(node, "expression") && Object.hasOwn(node, "spread")) {
        return node.spread ? { type: "SpreadElement", argument: visit(node.expression) } : visit(node.expression);
      }
    } else if (originalType === "OptionalChainingExpression") {
      if (!isRecord(node.base)) return node;
      const expression = visit({ ...node.base, optional: node.optional }, parentType, key, true);
      return inChain ? expression : { type: "ChainExpression", expression };
    } else if (originalType === "TsNonNullExpression") {
      const expression = visit(node.expression, originalType, "expression", inChain);
      if (!inChain && isRecord(expression) && expression.type === "ChainExpression") {
        return { type: "ChainExpression", expression: { type: "TSNonNullExpression", expression: expression.expression } };
      }
      return { ...node, type: "TSNonNullExpression", expression };
    } else if (originalType === "Parameter") {
      // Keep nonempty parameter decorators attached to the parameter.
      return visit({ ...(isRecord(node.pat) ? node.pat : {}), decorators: node.decorators });
    } else if (originalType === "Computed") {
      return visit(node.expression);
    } else if (LITERALS.has(originalType)) {
      node.type = "Literal";
      if (originalType === "NullLiteral") node.value = null;
      if (originalType === "RegExpLiteral") {
        node.regex = { pattern: node.pattern, flags: node.flags };
        delete node.pattern; delete node.flags; delete node.value;
      }
      if (originalType === "BigIntLiteral") {
        // SWC serializes BigInt as sign + little-endian base-2^32 digits.
        if (!Array.isArray(node.value) || !Array.isArray(node.value[1])) throw new Error("Unsupported SWC BigInt representation");
        const [sign, digits] = node.value;
        let bigint = 0n;
        for (const digit of [...digits].reverse()) bigint = (bigint << 32n) + BigInt(digit);
        node.bigint = (sign < 0 ? -bigint : bigint).toString();
        delete node.value;
      }
    } else if (originalType === "Module" || originalType === "Script") {
      node.type = "Program"; node.sourceType = originalType === "Module" ? "module" : "script";
      rename(node, "interpreter", "hashbang");
      if (typeof node.hashbang === "string") node.hashbang = { type: "Hashbang", value: node.hashbang };
    } else if (originalType === "Identifier") {
      if (parentType === "ObjectExpression" && key === "properties") {
        const identifier = visit(node);
        return { type: "Property", key: identifier, value: identifier, kind: "init", shorthand: true };
      }
      rename(node, "value", "name");
      if (parentType?.startsWith("JSX") && ["name", "object", "property", "namespace"].includes(key ?? "")) node.type = "JSXIdentifier";
    } else if (originalType === "PrivateName") {
      node.type = "PrivateIdentifier"; rename(node, "value", "name");
    } else if (originalType === "FunctionBody" || originalType === "BlockStatement") {
      node.type = "BlockStatement"; rename(node, "stmts", "body");
    } else if (originalType === "ClassDeclaration" || originalType === "ClassExpression") {
      rename(node, "identifier", "id");
      if (Array.isArray(node.body)) node.body = { type: "ClassBody", body: node.body };
      rename(node, "typeParams", "typeParameters"); rename(node, "superTypeParams", "superTypeArguments");
    } else if (originalType === "ClassMethod" || originalType === "PrivateMethod" || originalType === "Constructor") {
      node.type = "MethodDefinition";
      node.value = functionValue(isRecord(node.function) ? node.function : node);
      node.kind = originalType === "Constructor" ? "constructor" : node.kind === "getter" ? "get" : node.kind === "setter" ? "set" : "method";
      node.computed = isRecord(node.key) && node.key.type === "Computed";
      for (const field of ["function", "params", "body", "async", "generator", "typeParameters", "returnType"]) delete node[field];
    } else if (originalType === "ClassProperty" || originalType === "PrivateProperty") {
      node.type = "PropertyDefinition"; node.computed = isRecord(node.key) && node.key.type === "Computed";
    } else if (originalType === "StaticBlock" && isRecord(node.body)) {
      node.body = node.body.stmts ?? node.body.body;
    } else if (originalType === "KeyValueProperty" || originalType === "KeyValuePatternProperty") {
      node = property(node);
    } else if (originalType === "AssignmentPatternProperty") {
      node = property({ ...node, key: node.key, shorthand: true, value: node.value == null ? node.key : { type: "AssignmentPattern", left: node.key, right: node.value } });
    } else if (originalType === "MethodProperty" || originalType === "GetterProperty" || originalType === "SetterProperty") {
      const fn = functionValue(isRecord(node.function) ? node.function : node);
      node = property({ ...node, method: originalType === "MethodProperty", value: fn }, originalType === "GetterProperty" ? "get" : originalType === "SetterProperty" ? "set" : "init");
      for (const field of ["function", "params", "param", "body", "async", "generator", "typeParameters", "returnType"]) delete node[field];
    } else if (originalType === "RestElement") {
      delete node.rest;
    } else if (originalType === "SpreadElement") {
      node.argument = node.arguments; delete node.arguments; delete node.spread;
      if (parentType === "JSXOpeningElement") node.type = "JSXSpreadAttribute";
    } else if (originalType === "SuperPropExpression") {
      node.type = "MemberExpression"; rename(node, "obj", "object");
    } else if (originalType === "BinaryExpression" && ["&&", "||", "??"].includes(String(node.operator))) {
      node.type = "LogicalExpression";
    } else if (originalType === "ParenthesisExpression") {
      node.type = "ParenthesizedExpression";
    } else if (originalType === "MetaProperty" && typeof node.kind === "string") {
      const [meta, name] = node.kind.split(".");
      node.meta = { type: "Identifier", name: meta };
      node.property = { type: "Identifier", name };
      delete node.kind;
    } else if (originalType === "TemplateElement") {
      node.value = { raw: node.raw, cooked: node.cooked };
      delete node.raw; delete node.cooked;
    } else if (originalType === "TaggedTemplateExpression") {
      rename(node, "template", "quasi");
      rename(node, "typeParameters", "typeArguments");
    } else if (originalType === "CallExpression" && isRecord(node.callee) && node.callee.type === "Import" && Array.isArray(node.arguments)) {
      node.type = "ImportExpression";
      node.phase = node.callee.phase === "evaluation" ? undefined : node.callee.phase;
      const args = node.arguments;
      node.source = isRecord(args[0]) ? args[0].expression : args[0];
      node.options = isRecord(args[1]) ? args[1].expression : args[1];
      delete node.callee; delete node.arguments; delete node.typeArguments;
    } else if (originalType === "ExportDeclaration") {
      node.type = "ExportNamedDeclaration";
      if (isRecord(node.declaration) && /^(TsType|TsInterface)/.test(String(node.declaration.type))) node.exportKind = "type";
    } else if (originalType === "ExportDefaultExpression") {
      node.type = "ExportDefaultDeclaration"; rename(node, "expression", "declaration");
    } else if (originalType === "ExportDefaultDeclaration") {
      rename(node, "decl", "declaration");
      if (isRecord(node.declaration) && ["ClassExpression", "FunctionExpression"].includes(String(node.declaration.type))) node.declaration = { ...node.declaration, type: String(node.declaration.type).replace("Expression", "Declaration") };
    } else if (originalType === "ImportSpecifier") {
      if (node.imported == null) node.imported = node.local;
      node.importKind = node.isTypeOnly ? "type" : "value"; delete node.isTypeOnly;
    } else if (originalType === "ExportSpecifier") {
      rename(node, "orig", "local"); if (node.exported == null) node.exported = node.local;
      node.exportKind = node.isTypeOnly ? "type" : "value"; delete node.isTypeOnly;
    } else if (originalType === "JSXElement" || originalType === "JSXFragment") {
      rename(node, "opening", originalType === "JSXElement" ? "openingElement" : "openingFragment");
      rename(node, "closing", originalType === "JSXElement" ? "closingElement" : "closingFragment");
    } else if (originalType.startsWith("Ts")) {
      node.type = originalType.replace(/^Ts/, "TS");
      if (originalType === "TsKeywordType") { node.type = node.kind === "bigint" ? "TSBigIntKeyword" : `TS${String(node.kind)[0]?.toUpperCase()}${String(node.kind).slice(1)}Keyword`; delete node.kind; }
      for (const [from, to] of Object.entries(TS_FIELDS[String(node.type)] ?? {})) rename(node, from, to);
      if (["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(String(node.type))) rename(node, "typeParams", "typeParameters");
      if (originalType === "TsEnumDeclaration") { node.body = { type: "TSEnumBody", members: node.members }; delete node.members; rename(node, "isConst", "const"); }
      if (originalType === "TsMappedType" && isRecord(node.typeParam)) { node.key = node.typeParam.name; node.constraint = node.typeParam.constraint; delete node.typeParam; }
      if (originalType === "TsLiteralType" && isRecord(node.literal)) {
        if (node.literal.type === "TemplateLiteral") return visit({ ...node.literal, type: "TSTemplateLiteralType" });
        if (node.literal.type === "NumericLiteral" && typeof node.literal.value === "number" && (node.literal.value < 0 || Object.is(node.literal.value, -0))) {
          node.literal = { type: "UnaryExpression", operator: "-", argument: { ...node.literal, value: -node.literal.value } };
        }
      }
      if (originalType === "TsMethodSignature") node.kind = "method";
      if (originalType === "TsGetterSignature" || originalType === "TsSetterSignature") {
        node.type = "TSMethodSignature";
        node.kind = originalType === "TsGetterSignature" ? "get" : "set";
        if (originalType === "TsGetterSignature") rename(node, "typeAnnotation", "returnType");
        if (originalType === "TsSetterSignature") { node.params = [node.param]; delete node.param; }
      }
      if (originalType === "TsConstAssertion") {
        node.type = "TSAsExpression";
        node.typeAnnotation = { type: "TSTypeReference", typeName: { type: "Identifier", name: "const" } };
      }
      if (originalType === "TsExpressionWithTypeArguments") {
        if (["ClassDeclaration", "ClassExpression"].includes(parentType ?? "") && key === "implements") node.type = "TSClassImplements";
        if (parentType === "TSInterfaceDeclaration" && key === "extends") node.type = "TSInterfaceHeritage";
      }
      if (originalType === "TsTupleElement") {
        const label = isRecord(node.label) ? node.label : undefined;
        const rest = label?.type === "RestElement";
        const name = rest ? label.argument : label;
        const element = name ? { type: "TSNamedTupleMember", label: { ...(isRecord(name) ? name : {}), optional: false }, elementType: node.ty, optional: label?.optional } : node.ty;
        return rest ? { type: "TSRestType", typeAnnotation: visit(element) } : visit(element);
      }
      if (originalType === "TsModuleDeclaration" || originalType === "TsNamespaceDeclaration") {
        node.type = "TSModuleDeclaration";
        node.kind = originalType === "TsNamespaceDeclaration" || node.namespace ? "namespace" : "module";
        delete node.namespace;
        while (isRecord(node.body) && node.body.type === "TsNamespaceDeclaration") {
          const inner = node.body;
          node.id = { type: "TSQualifiedName", left: node.id, right: inner.id };
          node.body = inner.body;
        }
      }
    }
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
      rename(node, "identifier", "id"); if (node.body == null) node.type = "TSDeclareFunction";
    }
    if (isRecord(node.thisParam)) {
      node.params = [{ type: "Identifier", name: "this", typeAnnotation: node.thisParam.typeAnnotation }, ...(Array.isArray(node.params) ? node.params : [])];
      delete node.thisParam;
    }
    if (node.type === "MemberExpression") node.computed = isRecord(node.property) && node.property.type === "Computed";
    if ((node.type === "Program" || node.type === "BlockStatement") && Array.isArray(node.body)) {
      let inPrologue = true;
      node.body = node.body.map(statement => {
        if (!inPrologue || !isRecord(statement) || statement.type !== "ExpressionStatement" || !isRecord(statement.expression) || statement.expression.type !== "StringLiteral") {
          inPrologue = false;
          return statement;
        }
        const raw = statement.expression.raw;
        return { ...statement, directive: typeof raw === "string" ? raw.slice(1, -1) : statement.expression.value };
      });
    }
    if (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
      if (Object.hasOwn(node, "typeOnly")) { node[node.type === "ImportDeclaration" ? "importKind" : "exportKind"] = node.typeOnly ? "type" : "value"; delete node.typeOnly; }
      if (node.with != null) node.attributes = attributes(node.with); delete node.with;
    }
    for (const field of ["Static", "Abstract", "Optional", "Override"]) rename(node, `is${field}`, field.toLowerCase());
    const result: Node = Object.create(null);
    for (const [field, item] of Object.entries(node)) {
      // Only the object/callee branch continues a chain, not computed keys or arguments.
      result[field] = visit(item, typeof node.type === "string" ? node.type : parentType, field, inChain && ["object", "callee"].includes(field));
    }
    return result;
  }
  return normalizeAst(visit(ast));
}
