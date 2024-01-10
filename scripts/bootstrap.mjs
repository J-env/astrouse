import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import chalk from 'chalk';

const _require = createRequire(import.meta.url);
const { prompt } = _require('enquirer');

const rootPkg = _require('../package.json');
const packagesURL = new URL('../packages', import.meta.url);
const packagesPath = fileURLToPath(packagesURL);

bootstrap()
  .then(() => {
    console.log(chalk.green(`ok!`));
  })
  .catch(err => {
    console.error(err);
  });

async function bootstrap() {
  const { lead } = await prompt({
    type: 'select',
    name: 'lead',
    message: 'Update all packages / create new packages',
    choices: [
      { name: 'create-package', message: 'create new package' },
      { name: 'all', message: 'update all packages version ...' }
    ]
  });

  switch (lead) {
    case 'all':
      updateAllPackages();
      break;

    case 'create-package':
      const initial = 'package-name';

      let packageName =
        (
          await prompt({
            type: 'input',
            name: 'packageName',
            message: 'Input package name',
            initial: initial
          })
        ).packageName || '';

      packageName = packageName.trim();

      if (packageName && initial !== packageName) {
        if (/[^-_0-9a-zA-Z]+/.test(packageName)) {
          console.log(chalk.red(`Please enter a valid package name`));
          process.exit(1);
        }

        const projectDir = path.join(packagesPath, packageName);

        if (fs.existsSync(projectDir)) {
          console.log(chalk.yellow(`The current package already exists`));
          process.exit(1);
        } else {
          fs.mkdirSync(projectDir);
          createPackage(packageName);
        }
      } else {
        console.log(chalk.yellow(`Please enter package name`));
        process.exit(1);
      }
      break;

    default:
      break;
  }
}

function updateAllPackages() {
  const files = fs.readdirSync(packagesURL);
  files.forEach(shortName => updatePackage(shortName));
}

function updatePackage(name) {
  createPackage(name, true);
}

function createPackage(name, update) {
  const joinPath = p => path.join(packagesPath, name, p);

  if (!fs.statSync(joinPath('')).isDirectory()) {
    return;
  }

  const projectName = `@${rootPkg.name}/${name}`;
  const pkgPath = joinPath(`package.json`);
  const pkgExists = fs.existsSync(pkgPath);
  const pkg_json = {};

  if (pkgExists) {
    Object.assign(pkg_json, _require(pkgPath), {});

    // 不更新，本地测试包等
    if (pkg_json.private) {
      return;
    }
  }

  createPackageJson(projectName, name, pkg_json, pkgPath);

  // README.md
  const readmePath = joinPath(`README.md`);
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# ${projectName}`);
  }

  // create src ...
  if (!update) {
    // src
    const srcDir = joinPath(`src`);
    const indexPath = joinPath(`src/index.ts`);

    if (!fs.existsSync(indexPath)) {
      // create src dir
      if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir);
      }

      fs.writeFileSync(indexPath, `export {};\n`);
    }
  }
}

function createPackageJson(projectName, packageName, pkg_json, pkgPath) {
  const gitUrl =
    rootPkg.repository?.url || 'https://github.com/J-env/astrouse.git';

  // package.json
  const json = {
    name: projectName,
    version: rootPkg.version,
    description: pkg_json.description || '',
    type: 'module',
    main: `./dist/index.js`,
    module: `./dist/index.js`,
    types: `./dist/index.d.ts`,
    files: [...new Set(['dist', ...(pkg_json.files || [])])],
    exports: {
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js'
      },
      ...pkg_json.exports
    },
    buildOptions: pkg_json.buildOptions || {},
    keywords: pkg_json.keywords || ['astrouse'],
    dependencies: pkg_json.dependencies || {},
    devDependencies: pkg_json.devDependencies || {},
    peerDependencies: pkg_json.peerDependencies || {},
    bugs: {
      url: 'https://github.com/J-env/astrouse/issues'
    },
    repository: {
      type: 'git',
      url: `git+${gitUrl.replace('git+', '')}`,
      directory: `packages/${packageName}`
    },
    author: '',
    license: 'ISC'
  };

  Object.entries(pkg_json).forEach(([name, val]) => {
    if (name in json) {
      return;
    }

    json[name] = val;
  });

  fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2));
}
