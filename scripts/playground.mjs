import minimist from 'minimist';
import { execa } from 'execa';

const args = minimist(process.argv.slice(2));

const isbuild = !!args.build;
const isdocsu = !!args.docsu;
const ischeck = !!args.check;

run();

async function run() {
  if (ischeck) {
    // pnpm --filter playground astro:check
    await execa('pnpm', ['--filter', 'playground', 'astro:check'], {
      stdio: 'inherit'
    });
  }

  if (isdocsu) {
    // pnpm --filter docs dev
    return await execa('pnpm', ['--filter', 'docs', 'dev'], {
      stdio: 'inherit'
    });
  }

  // pnpm --filter playground dev
  await execa('pnpm', ['--filter', 'playground', isbuild ? 'build' : 'dev'], {
    stdio: 'inherit'
  });
}
