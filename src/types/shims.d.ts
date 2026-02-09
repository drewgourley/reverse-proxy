declare module '*.json' {
  const value: any;
  export default value;
}

// Allow importing old CommonJS local modules with implicit any
declare const __dirname: string;
