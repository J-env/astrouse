import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import replace from '@rollup/plugin-replace';
import json from '@rollup/plugin-json';
import commonJS from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
// import terser from '@rollup/plugin-terser';
import alias from '@rollup/plugin-alias';
import polyfillNode from 'rollup-plugin-polyfill-node';
import esbuild from 'rollup-plugin-esbuild';

import { entries } from './scripts/aliases.mjs';
import { inlineEnums } from './scripts/inline-enums.mjs';

if (!process.env.TARGET) {
  throw new Error('TARGET package must be specified via --environment flag.');
}

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const rootPkg = require('./package.json');
const masterVersion = rootPkg.version;

const packagesDir = path.resolve(__dirname, 'packages');
const packageDir = path.resolve(packagesDir, process.env.TARGET);

const resolve = p => path.resolve(packageDir, p);
const pkg = require(resolve(`package.json`));
const packageOptions = pkg.buildOptions || {};
// const name = packageOptions.filename || path.basename(packageDir);

const [enumPlugin, enumDefines] = inlineEnums();

const outputFile = file => resolve(`dist/${file}`);

const outputConfigs = {
  'esm-bundler': {
    file: outputFile(`index.js`),
    format: `es`
  },
  'esm-browser': {
    file: outputFile(`index.esm-browser.js`),
    format: `es`
  },
  cjs: {
    file: outputFile(`index.cjs.js`),
    format: `cjs`
  },
  global: {
    file: outputFile(`index.global.js`),
    format: `iife`
  }
};

const defaultFormats = ['esm-bundler'];
const inlineFormats = process.env.FORMATS && process.env.FORMATS.split(',');
const packageFormats =
  inlineFormats || packageOptions.formats || defaultFormats;

// rollup configs
const packageConfigs = process.env.PROD_ONLY
  ? []
  : packageFormats.map(format => createConfig(format, outputConfigs[format]));

export default packageConfigs;

function createConfig(format, output, plugins = []) {
  if (!output) {
    console.log(chalk.yellow(`invalid format: "${format}"`));
    process.exit(1);
  }

  const isProductionBuild =
    process.env.__DEV__ === 'false' || /\.prod\.js$/.test(output.file);

  const isBundlerESMBuild = /esm-bundler/.test(format);
  const isBrowserESMBuild = /esm-browser/.test(format);
  const isNodeBuild = format === 'cjs';
  const isGlobalBuild = /global/.test(format);

  const isBrowserBuild =
    (isGlobalBuild || isBrowserESMBuild || isBundlerESMBuild) &&
    !packageOptions.enableNonBrowserBranches;

  output.exports = 'named';

  if (isNodeBuild) {
    output.esModule = true;
  }

  output.sourcemap = !!process.env.SOURCE_MAP;
  output.externalLiveBindings = false;

  if (isGlobalBuild) {
    output.name = packageOptions.name;
  }

  let entryFile = /runtime$/.test(format) ? `src/runtime.ts` : `src/index.ts`;

  // we are bundling forked consolidate.js in compiler-sfc which dynamically
  // requires a ton of template engines which should be ignored.
  function resolveNodePlugins() {
    /** @type {ReadonlyArray<string>} */
    let cjsIgnores = [];

    return (format === 'cjs' &&
      Object.keys(pkg.devDependencies || {}).length) ||
      packageOptions.enableNonBrowserBranches
      ? [
          commonJS({
            sourceMap: false,
            ignore: cjsIgnores
          }),
          ...(format === 'cjs' ? [] : [polyfillNode()]),
          nodeResolve()
        ]
      : [];
  }

  function resolveDefine() {
    /** @type {Record<string, string>} */
    const replacements = {
      __COMMIT__: `"${process.env.COMMIT}"`,
      __VERSION__: `"${masterVersion}"`,
      // this is only used during Vue's internal tests
      __TEST__: `false`,
      // If the build is expected to run directly in the browser (global / esm builds)
      __BROWSER__: String(isBrowserBuild),
      __GLOBAL__: String(isGlobalBuild),
      __ESM_BUNDLER__: String(isBundlerESMBuild),
      __ESM_BROWSER__: String(isBrowserESMBuild),
      // is targeting Node (SSR)?
      __NODE_JS__: String(isNodeBuild),
      // need SSR-specific branches?
      __SSR__: String(isNodeBuild || isBundlerESMBuild)
    };

    if (!isBundlerESMBuild) {
      // hard coded dev/prod builds
      replacements.__DEV__ = String(!isProductionBuild);
    }

    // allow inline overrides like
    //__RUNTIME_COMPILE__=true pnpm build runtime-core
    Object.keys(replacements).forEach(key => {
      if (key in process.env) {
        const value = process.env[key];
        assert(typeof value === 'string');
        replacements[key] = value;
      }
    });

    return replacements;
  }

  function resolveReplace() {
    const replacements = { ...enumDefines };

    if (isBundlerESMBuild) {
      Object.assign(replacements, {
        // preserve to be handled by bundlers
        __DEV__: `!!(process.env.NODE_ENV !== 'production')`
      });
    }

    // for compiler-sfc browser build inlined deps
    if (isBrowserESMBuild) {
      Object.assign(replacements, {
        'process.env': '({})',
        'process.platform': '""',
        'process.stdout': 'null'
      });
    }

    if (Object.keys(replacements).length) {
      return [replace({ values: replacements, preventAssignment: true })];
    } else {
      return [];
    }
  }

  return {
    input: resolve(entryFile),
    // Global and Browser ESM builds inlines everything so that they can be
    // used alone.
    external: resolveExternal(),
    plugins: [
      json({
        namedExports: false
      }),
      alias({
        entries
      }),
      enumPlugin,
      ...resolveReplace(),
      esbuild({
        tsconfig: path.resolve(__dirname, 'tsconfig.json'),
        sourceMap: output.sourcemap,
        minify: false,
        // target: 'es2019',
        define: resolveDefine()
      }),
      ...resolveNodePlugins(),
      ...plugins
    ],
    output,
    onwarn: (msg, warn) => {
      if (msg.code !== 'CIRCULAR_DEPENDENCY') {
        warn(msg);
      }
    },
    treeshake: {
      moduleSideEffects: false
    }
  };
}

function resolveExternal() {
  const treeShakenDeps = [
    'source-map',
    'source-map-js',
    '@babel/parser',
    '@babel/standalone',
    'estree-walker',
    'entities/lib/decode.js',
    'vite',
    'postcss',
    /^node:/,
    /^astro\//,
    /^vite\//,
    /^tailwindcss\//,
    /^@babel\//,
    /\.astro$/,
    /\/node_modules\//,
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(rootPkg['dependencies'] || {}),
    ...Object.keys(rootPkg['devDependencies'] || {}),
    ...['path', 'url', 'stream']
  ];

  return treeShakenDeps;
}
