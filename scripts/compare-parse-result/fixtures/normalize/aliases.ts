type T = string | number; type X = { x: T } & { y: boolean }; type K = keyof X; type Q = typeof value;
