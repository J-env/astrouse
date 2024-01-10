import fs from 'node:fs';
import { createRequire } from 'node:module';
import chalk from 'chalk';

const _require = createRequire(import.meta.url);

export const targets = fs.readdirSync('packages').filter(f => {
  if (
    !fs.statSync(`packages/${f}`).isDirectory() ||
    !fs.existsSync(`packages/${f}/package.json`)
  ) {
    return false;
  }

  const pkg = _require(`../packages/${f}/package.json`);
  if (pkg.private && !pkg.buildOptions) {
    return false;
  }

  return true;
});

/**
 *
 * @param {ReadonlyArray<string>} partialTargets
 * @param {boolean | undefined} includeAllMatching
 */
export function fuzzyMatchTarget(partialTargets, includeAllMatching) {
  /** @type {Array<string>} */
  const matched = [];

  partialTargets.forEach(partialTarget => {
    for (const target of targets) {
      if (target.match(partialTarget)) {
        matched.push(target);

        if (!includeAllMatching) {
          break;
        }
      }
    }
  });

  if (matched.length) {
    return matched;
  } else {
    console.log();
    console.error(
      `  ${chalk.bgRed.white(' ERROR ')} ${chalk.red(
        `Target ${chalk.underline(partialTargets)} not found!`
      )}`
    );
    console.log();

    process.exit(1);
  }
}
