import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import { dts } from 'rollup-plugin-dts';

if (!fs.existsSync('temp/packages')) {
  console.warn(
    'no temp dts files found. run `tsc -p tsconfig.build.json` first.'
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const packagesDir = path.resolve(__dirname, 'packages');
const resolve = (pkgName, p) => path.resolve(packagesDir, pkgName, p);

const rootJson = require('./package.json');

const targets = process.env.TARGETS ? process.env.TARGETS.split(',') : null;
const packages = fs.readdirSync('temp/packages');
const targetPackages = targets
  ? packages.filter(pkg => targets.includes(pkg))
  : packages;

export default targetPackages.map(pkg => {
  const pkgjson = require(resolve(pkg, `package.json`));

  return {
    input: `./temp/packages/${pkg}/src/index.d.ts`,
    output: {
      // file: `packages/${pkg}/dist/${pkg}.d.ts`,
      file: `packages/${pkg}/dist/index.d.ts`,
      format: 'es'
    },
    external: [
      ...new Set([
        ...resolveExternal(),
        ...Object.keys(pkgjson.dependencies || {}),
        ...Object.keys(pkgjson.devDependencies || {}),
        ...Object.keys(pkgjson.peerDependencies || {})
      ])
    ],
    plugins: [dts(), patchTypes(pkg)],
    onwarn(warning, warn) {
      // during dts rollup, everything is externalized by default
      if (
        warning.code === 'UNRESOLVED_IMPORT' &&
        !warning.exporter?.startsWith('.')
      ) {
        return;
      }

      warn(warning);
    }
  };
});

function resolveExternal() {
  return [
    'source-map',
    'source-map-js',
    '@babel/parser',
    '@babel/standalone',
    'estree-walker',
    'vite',
    'postcss',
    /^node:/,
    /^astro\//,
    /^tailwindcss\//,
    /^@babel\//,
    /\.astro$/,
    /\/node_modules\//,
    ...Object.keys(rootJson['dependencies'] || {}),
    ...Object.keys(rootJson.devDependencies || {}),
    ...['path', 'url', 'stream']
  ];
}

function patchTypes(pkg) {
  return {
    name: 'patch-types',
    renderChunk(code, chunk) {
      const s = new MagicString(code);
      const ast = parse(code, {
        plugins: ['typescript'],
        sourceType: 'module'
      });

      const isExported = new Set();
      const shouldRemoveExport = new Set();

      /**
       * @param {import('@babel/types').VariableDeclarator | import('@babel/types').TSTypeAliasDeclaration | import('@babel/types').TSInterfaceDeclaration | import('@babel/types').TSDeclareFunction | import('@babel/types').TSInterfaceDeclaration | import('@babel/types').TSEnumDeclaration | import('@babel/types').ClassDeclaration} node
       * @param {import('@babel/types').VariableDeclaration} [parentDecl]
       */
      function processDeclaration(node, parentDecl) {
        if (!node.id) {
          return;
        }

        assert(node.id.type === 'Identifier');

        const name = node.id.name;
        if (name.startsWith('_')) {
          return;
        }

        shouldRemoveExport.add(name);
        if (isExported.has(name)) {
          const start = (parentDecl || node).start;
          assert(typeof start === 'number');
          s.prependLeft(start, `export `);
        }
      }

      // pass 0: check all exported types
      for (const node of ast.program.body) {
        if (node.type === 'ExportNamedDeclaration' && !node.source) {
          for (let i = 0; i < node.specifiers.length; i++) {
            const spec = node.specifiers[i];
            if (spec.type === 'ExportSpecifier') {
              isExported.add(spec.local.name);
            }
          }
        }
      }

      // pass 1: remove internals + add exports
      for (const node of ast.program.body) {
        if (node.type === 'VariableDeclaration') {
          processDeclaration(node.declarations[0], node);
          if (node.declarations.length > 1) {
            assert(typeof node.start === 'number');
            assert(typeof node.end === 'number');
            throw new Error(
              `unhandled declare const with more than one declarators:\n${code.slice(
                node.start,
                node.end
              )}`
            );
          }
        } else if (
          node.type === 'TSTypeAliasDeclaration' ||
          node.type === 'TSInterfaceDeclaration' ||
          node.type === 'TSDeclareFunction' ||
          node.type === 'TSEnumDeclaration' ||
          node.type === 'ClassDeclaration'
        ) {
          processDeclaration(node);
        } else if (node.type === 'TSModuleDeclaration') {
          // @TODOs:
        }
      }

      // pass 2: remove exports
      for (const node of ast.program.body) {
        if (node.type === 'ExportNamedDeclaration' && !node.source) {
          let removed = 0;
          for (let i = 0; i < node.specifiers.length; i++) {
            const spec = node.specifiers[i];
            if (
              spec.type === 'ExportSpecifier' &&
              shouldRemoveExport.has(spec.local.name)
            ) {
              assert(spec.exported.type === 'Identifier');

              const exported = spec.exported.name;
              if (exported !== spec.local.name) {
                // this only happens if we have something like
                //   type Foo
                //   export { Foo as Bar }
                continue;
              }

              const next = node.specifiers[i + 1];
              if (next) {
                assert(typeof spec.start === 'number');
                assert(typeof next.start === 'number');
                s.remove(spec.start, next.start);
              } else {
                // last one
                const prev = node.specifiers[i - 1];
                assert(typeof spec.start === 'number');
                assert(typeof spec.end === 'number');
                s.remove(
                  prev
                    ? (assert(typeof prev.end === 'number'), prev.end)
                    : spec.start,
                  spec.end
                );
              }

              removed++;
            }
          }

          if (removed === node.specifiers.length) {
            assert(typeof node.start === 'number');
            assert(typeof node.end === 'number');
            s.remove(node.start, node.end);
          }
        }
      }

      code = s.toString();

      // append pkg specific types
      const additionalTypeDir = `packages/${pkg}/types`;

      if (fs.existsSync(additionalTypeDir)) {
        const hasExport = code.indexOf('export ') !== -1;

        code +=
          '\n' +
          fs
            .readdirSync(additionalTypeDir)
            .map(file => {
              const str = fs.readFileSync(
                `${additionalTypeDir}/${file}`,
                'utf-8'
              );

              if (hasExport) {
                return str.replace(/export \{\};/g, '');
              }

              return str;
            })
            .join('\n');
      }

      return code;
    }
  };
}
