/** Reverse Wtf8Atom's transport encoding, not JavaScript source escapes. */
export function normalizeSwcString(value: string): string {
  // hstr encodes literal \uXXXX with one extra slash and lone surrogates as
  // \uXXXX. Leave all other slashes and incomplete/non-hex escapes intact.
  return value.replace(/\\(\\u(?=[0-9a-fA-F]{4})|u([0-9a-fA-F]{4}))/g,
    (_, escaped: string, hex: string | undefined) => hex === undefined ? escaped : String.fromCharCode(Number.parseInt(hex, 16)));
}
