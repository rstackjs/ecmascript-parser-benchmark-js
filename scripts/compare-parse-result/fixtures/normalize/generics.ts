function f<T extends string = string>(x: T): T { return x; } const x = f<string>("x");
