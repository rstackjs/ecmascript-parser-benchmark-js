/* before */ const text = "// text /* text */";
const pattern = /\/\/not-a-comment/;
const template = `/* text */ ${/* interpolation */ text}`;
const element = <div>{/* jsx */ text}</div>; // after
/** doc */ interface I { /* field */ value: string; }
// repeated
// repeated
