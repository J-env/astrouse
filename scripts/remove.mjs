import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';

main().then(() => {
  console.log(chalk.green('remove ok!'));
});

async function main() {
  const dirs = get_node_modules();
  const removes = new Set();

  for (const d of dirs) {
    removes.add(new URL(`../packages/${d}/dist`, import.meta.url));
    removes.add(new URL(`../packages/${d}/node_modules`, import.meta.url));
  }

  removes.add(new URL(`../node_modules`, import.meta.url));
  removes.add(new URL(`../docs/node_modules`, import.meta.url));
  removes.add(new URL(`../playground/node_modules`, import.meta.url));

  for (const p of [...removes]) {
    await fs.promises.rm(p, {
      recursive: true,
      force: true
    });
  }
}

function get_node_modules() {
  return fs
    .readdirSync('packages')
    .filter(f => {
      if (!fs.statSync(`packages/${f}`).isDirectory()) {
        return false;
      }

      if (
        fs.existsSync(path.resolve(`packages/${f}/dist`)) ||
        fs.existsSync(path.resolve(`packages/${f}/node_modules`))
      ) {
        return true;
      }

      return false;
    })
    .filter(Boolean);
}
