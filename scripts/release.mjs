import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import minimist from 'minimist';
import chalk from 'chalk';
import { execa } from 'execa';

const _require = createRequire(import.meta.url);
const semver = _require('semver');
const { prompt } = _require('enquirer');
const rootJson = _require('../package.json');

const args = minimist(process.argv.slice(2), {
  alias: {
    skipBuild: 'skip-build',
    skipTests: 'skip-tests',
    skipGit: 'skip-git',
    skipPrompts: 'skip-prompts'
  }
});
const currentVersion = rootJson.version;
const preId = args.preid || semver.prerelease(currentVersion)?.[0];
// '0.0.1-0' => 'major.minor.patch-pre()'
/** @type {ReadonlyArray<import('semver').ReleaseType>} */
const versionIncrements = [
  'patch',
  'minor',
  'major',
  ...(preId ? ['prepatch', 'preminor', 'premajor', 'prerelease'] : [])
];
const isDryRun = args.dry;
const skipBuild = args.skipBuild;
// const skipPrompts = args.skipPrompts;
const skipGit = args.skipGit;
/** @type {string[]} */
const skippedPackages = [];

/** @type {boolean | undefined} */
let skipTests = args.skipTests;
let versionUpdated = false;

const packagesURL = new URL('../packages', import.meta.url);
const packagesPath = fileURLToPath(packagesURL);
const getPkgRoot = pkg => path.resolve(packagesPath, pkg);

const packages = fs
  .readdirSync(packagesURL)
  .filter(p => !p.endsWith('.ts') && !p.startsWith('.'))
  .filter(p => {
    const pkgRoot = getPkgRoot(p);
    if (fs.statSync(pkgRoot).isDirectory()) {
      const pkgPath = path.resolve(pkgRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      return !pkg.private;
    }
  });

const inc = i => semver.inc(currentVersion, i, preId);
// const bin = name => {
//   return fileURLToPath(
//     new URL('../node_modules/.bin/' + name, import.meta.url)
//   );
// };
const run = (bin, args, opts = {}) => {
  return execa(bin, args, { stdio: 'inherit', ...opts });
};
const dryRun = (bin, args, opts = {}) => {
  return console.log(chalk.blue(`[dryrun] ${bin} ${args.join(' ')}`), opts);
};
const runIfNotDry = isDryRun ? dryRun : run;
const step = msg => console.log(chalk.cyan(msg));

let targetVersion = '';

// run...
main()
  .then(() => {})
  .catch(err => {
    if (versionUpdated) {
      // revert to current version on failed releases
      updateVersions(currentVersion);
    }
    console.error(err);
    process.exit(1);
  });

async function main() {
  targetVersion = args._[0];

  if (!targetVersion) {
    /** @type {{ release: string }} */
    const { release } = await prompt({
      type: 'select',
      name: 'release',
      message: 'Select release type',
      choices: versionIncrements.map(i => `${i} (${inc(i)})`).concat(['custom'])
    });

    if (release === 'custom') {
      targetVersion = (
        await prompt({
          type: 'input',
          name: 'version',
          message: 'Input custom version',
          initial: currentVersion
        })
      ).version;
    } else {
      // patch (0.0.2) | minor (0.0.2) | major (0.0.2)
      targetVersion = release.match(/\((.*)\)/)?.[1] ?? '';
    }
  }

  if (!semver.valid(targetVersion)) {
    throw new Error(`invalid target version: ${targetVersion}`);
  }

  /** @type {{ yes: boolean }} */
  const { yes: confirmRelease } = await prompt({
    type: 'confirm',
    name: 'yes',
    message: `Releasing v${targetVersion}. Confirm?`
  });

  if (!confirmRelease) {
    return;
  }

  // test
  await runTests();

  // update all package versions and inter-dependencies
  await runUpdateVersions();

  // build
  await runBuilding();

  // update pnpm-lock.yaml
  step('\nUpdating lockfile...');
  await run(`pnpm`, ['install', '--prefer-offline']);

  // git commit
  await runGitCommit();

  // publish packages
  await runPublishPackage();

  // git push
  await runGitPush();

  // workspace
  await runUpdateWorkspaceVersions();
}

// =======================================================================
async function runTests() {
  if (!skipTests) {
    step('\nRunning tests...');

    if (!isDryRun) {
      // @TODOs: pnpm test run
      // await run('pnpm', ['test', 'run']);
    } else {
      console.log(`Skipped (dry run)`);
    }
  } else {
    step('Tests skipped.');
  }
}

async function runUpdateVersions() {
  step('\nUpdating cross dependencies...');
  updateVersions(targetVersion);
  versionUpdated = true;
}

async function runBuilding() {
  step('\nBuilding all packages...');

  await run('pnpm', ['check']);

  if (!skipBuild && !isDryRun) {
    // pnpm run build --release
    await run('pnpm', ['run', 'build', '--release']);
    // await run('pnpm', ['run', 'build']);
  } else {
    console.log(`(skipped)`);
  }
}

async function runGitCommit() {
  if (skipGit) return;

  const { stdout } = await run('git', ['diff'], { stdio: 'pipe' });

  if (stdout) {
    step('\nCommitting changes...');

    // git add -A
    await runIfNotDry('git', ['add', '-A']);
    await runIfNotDry('git', ['commit', '-m', `release: v${targetVersion}`]);
  } else {
    console.log('No changes to commit.');
  }
}

async function runPublishPackage() {
  step('\nPublishing packages...');

  const additionalPublishFlags = [];
  if (isDryRun) {
    additionalPublishFlags.push('--dry-run');
  }

  if (skipGit) {
    additionalPublishFlags.push('--no-git-checks');
  }

  // bypass the pnpm --publish-branch restriction which isn't too useful to us
  // otherwise it leads to a prompt and blocks the release script
  const branch = await getBranch();
  if (branch !== 'main') {
    additionalPublishFlags.push('--publish-branch', branch);
  }

  for (const pkg of packages) {
    await publishPackage(pkg, targetVersion, additionalPublishFlags);
  }
}

async function runGitPush() {
  if (skipGit) return;

  step('\nGit Pushing...');

  await runIfNotDry('git', ['tag', `v${targetVersion}`]);
  await runIfNotDry('git', ['push', 'origin', `refs/tags/v${targetVersion}`]);
  await runIfNotDry('git', ['push']);

  if (isDryRun) {
    console.log(`\nDry run finished - run git diff to see package changes.`);
  }

  if (skippedPackages.length) {
    console.log(
      chalk.yellow(
        `The following packages are skipped and NOT published:\n- ${skippedPackages.join(
          '\n- '
        )}`
      )
    );
  }

  console.log();
}

async function runUpdateWorkspaceVersions() {
  // packages.forEach(p => {
  //   updatePackage(getPkgRoot(p), targetVersion, true);
  // });
}

// =======================================================================
function updateVersions(version) {
  // 1. update root package.json
  updatePackage(fileURLToPath(new URL('../', import.meta.url)), version);
  // 2. update all packages
  packages.forEach(p => updatePackage(getPkgRoot(p), version));
}

function updatePackage(pkgRoot, version, isWorkspace) {
  const pkgPath = path.resolve(pkgRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  pkg.version = version;
  updateDeps(pkg, 'dependencies', version, isWorkspace);
  updateDeps(pkg, 'devDependencies', version, isWorkspace);
  updateDeps(pkg, 'peerDependencies', version, isWorkspace);

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function isCorePackage(/** @type {string} */ pkgName) {
  if (!pkgName) return false;

  return (
    pkgName.startsWith('@astrouse') &&
    packages.includes(pkgName.replace(/^@astrouse\//, ''))
  );
}

function updateDeps(pkg, depType, version, isWorkspace) {
  const deps = pkg[depType];

  if (!deps) return;

  Object.keys(deps).forEach(dep => {
    if (isCorePackage(dep)) {
      !isWorkspace &&
        console.log(
          chalk.yellow(`${pkg.name} -> ${depType} -> ${dep}@${version}`)
        );

      deps[dep] = isWorkspace ? `workspace:*` : version;
    }
  });
}

async function publishPackage(pkgName, version, additionalFlags) {
  if (skippedPackages.includes(pkgName)) {
    return;
  }

  const pkgRoot = getPkgRoot(pkgName);

  let releaseTag = null;

  if (args.tag) {
    releaseTag = args.tag;
  } else if (version.includes('alpha')) {
    releaseTag = 'alpha';
  } else if (version.includes('beta')) {
    releaseTag = 'beta';
  } else if (version.includes('rc')) {
    releaseTag = 'rc';
  }

  step([
    `Publishing ${pkgName}...`,
    `Version ${version}`,
    `ReleaseTag ${releaseTag}`
  ]);

  try {
    // Don't change the package manager here as we rely on pnpm to handle
    // workspace:* deps
    await run(
      'pnpm',
      [
        'publish',
        ...(releaseTag ? ['--tag', releaseTag] : []),
        '--access',
        'public',
        ...additionalFlags
      ],
      {
        cwd: pkgRoot,
        stdio: 'pipe'
      }
    );

    console.log(chalk.green(`Successfully published ${pkgName}@${version}`));
  } catch (/** @type {any} */ e) {
    if (e.stderr.match(/previously published/)) {
      console.log(chalk.red(`Skipping already published: ${pkgName}`));
    } else {
      throw e;
    }
  }
}

// fns =======================================================================
async function getBranch() {
  return (await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout;
}
