abstract class C {
  abstract x: number;
  abstract m<T>(value: T): T;
  private readonly field = 1;
  #method() { return this.field; }
  constructor(public value: number) {}
}
const object = { async method<T>(value: T) { return value; }, *generator() { yield 1; }, get x() { return 1; }, set x(value) {} };
