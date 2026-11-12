class C<T> implements I<T> { public readonly x!: T; protected y?: number; private m(value: T): T { return value; } constructor(public z: T) {} } interface I<T> { x: T; }
