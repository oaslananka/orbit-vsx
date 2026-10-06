declare module 'braces' {
  interface BracesOptions {
    maxDepth?: number;
    maxLength?: number;
    escapeInvalid?: boolean;
    keepEscaping?: boolean;
    keepQuotes?: boolean;
    rangeLimit?: number;
    step?: number;
  }

  interface BracesModule {
    (pattern: string, options?: BracesOptions): string[];
    expand(pattern: string, options?: BracesOptions): string[];
    parse(pattern: string, options?: BracesOptions): unknown;
    compile(ast: unknown, options?: BracesOptions): string;
  }

  const braces: BracesModule;
  export = braces;
  export default braces;
}