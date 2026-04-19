// Type declaration for the punycode module.
// The package ships without its own TypeScript declarations.
declare module "punycode/" {
  export function toASCII(input: string): string;
  export function toUnicode(input: string): string;
  export function decode(input: string): string;
  export function encode(input: string): string;
  export const ucs2: {
    decode: (input: string) => number[];
    encode: (input: number[]) => string;
  };
  export const version: string;
  const _default: {
    toASCII: typeof toASCII;
    toUnicode: typeof toUnicode;
    decode: typeof decode;
    encode: typeof encode;
    ucs2: typeof ucs2;
    version: typeof version;
  };
  export default _default;
}
