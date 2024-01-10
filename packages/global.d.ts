/// <reference types="astro/client" />

// Global compile-time constants
declare const __DEV__: boolean;
declare const __TEST__: boolean;
declare const __BROWSER__: boolean;
declare const __GLOBAL__: boolean;
declare const __ESM_BUNDLER__: boolean;
declare const __ESM_BROWSER__: boolean;
declare const __NODE_JS__: boolean;
declare const __SSR__: boolean;
// commit
declare const __COMMIT__: string;
declare const __VERSION__: string;

// for tests
declare namespace jest {
  interface Matchers<R, T> {
    toHaveBeenWarned(): R;
    toHaveBeenWarnedLast(): R;
    toHaveBeenWarnedTimes(n: number): R;
  }
}

declare module 'file-saver' {
  export function saveAs(blob: any, name: any): void;
}

declare module 'estree-walker' {
  export function walk<T>(
    root: T,
    options: {
      enter?: (node: T, parent: T | undefined) => any;
      leave?: (node: T, parent: T | undefined) => any;
      exit?: (node: T) => any;
    } & ThisType<{ skip: () => void }>
  );
}

declare module 'source-map-js' {
  export interface SourceMapGenerator {
    // SourceMapGenerator has this method but the types do not include it
    toJSON(): RawSourceMap;
    _sources: Set<string>;
    _names: Set<string>;
    _mappings: {
      add(mapping: MappingItem): void;
    };
  }
}

declare module '*.astro' {
  export interface Props {}

  function Component(props: Props): any;
  export default Component;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<{}, {}, any>;
  export default component;
}
