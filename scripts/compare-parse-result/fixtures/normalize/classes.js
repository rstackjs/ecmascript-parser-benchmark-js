class A extends B { #x = 1; static y = 2; get z() { return this.#x; } set z(v) { this.#x = v; } m(x) { return super.m(x); } }
