import { JSX_ENTITIES } from "./jsx-entities.ts";

/** Decode JSX entities once; preserve whitespace and unknown entities. */
export function normalizeJsxText(raw: string): string {
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (entity, name: string) => {
    if (!name.startsWith("#")) return JSX_ENTITIES[name] ?? entity;
    const hex = name.startsWith("#x");
    const codePoint = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
  });
}
