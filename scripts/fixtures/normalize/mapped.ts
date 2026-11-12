type M<T> = { readonly [K in keyof T as K]?: T[K] }; type C<T> = T extends string ? true : false;
