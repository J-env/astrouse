import path from 'node:path';
import { createRequire } from 'node:module';
import minimist from 'minimist';
import chalk from 'chalk';
import { execa, execaSync } from 'execa';

import { targets as allTargets, fuzzyMatchTarget } from './utils.mjs';
import { scanEnums } from './inline-enums.mjs';
import { MyWorker } from './worker.mjs';

const _require = createRequire(import.meta.url);

const args = minimist(process.argv.slice(2));
// []
const targets = args._;
const formats = args.formats || args.f;
const sourceMap = args.sourcemap || args.s;
const buildAllMatching = args.all || args.a;
const devOnly = args.devOnly || args.d;
const prodOnly = !devOnly && (args.prodOnly || args.p);

const isRelease = args.release;
const commit = execaSync('git', ['rev-parse', '--short=7', 'HEAD']).stdout;
const buildTypes = true;

run_build();

async function run_build() {
  const removeCache = scanEnums();

  try {
    const alls = targets.length
      ? fuzzyMatchTarget(targets, buildAllMatching)
      : allTargets;

    // build
    await buildAll(alls);

    // build types
    await runBuildTypes(alls.join(','));
  } finally {
    removeCache();
  }
}

/**
 *
 * @param {string} alls
 */
async function runBuildTypes(alls) {
  if (!buildTypes) return;

  await execa(
    'pnpm',
    [
      'run',
      'build-dts',
      ...(targets.length ? ['--environment', `TARGETS:${alls}`] : [])
    ],
    {
      stdio: 'inherit'
    }
  );
}

/**
 *
 * @param {ReadonlyArray<string>} targets
 */
async function buildAll(targets) {
  console.log(chalk.bold(chalk.green(`The build begins!`)));

  const myWorker = new MyWorker(new URL('./build-work.mjs', import.meta.url), {
    name: 'scripts_build_worker',
    workerData: {
      _name: 'scripts_build',
      formats,
      commit,
      prodOnly,
      sourceMap
    }
  });

  await Promise.all(
    targets.map(async target => {
      const pkgDir = path.resolve(`packages/${target}`);
      const pkg = _require(`${pkgDir}/package.json`);

      if ((isRelease || !targets.length) && pkg.private) {
        return;
      }

      const env =
        (pkg.buildOptions && pkg.buildOptions.env) ||
        (devOnly ? 'development' : 'production');

      return await myWorker.run({
        pkgDir,
        target,
        env
      });
    })
  );

  console.log(chalk.bold(chalk.green(`Build completed!`)));

  myWorker.destroy();
}
