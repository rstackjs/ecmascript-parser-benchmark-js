async function f(a = 1, ...rest) { return await g(a, ...rest); } const g = (x) => x; function* gen() { yield* values; }
