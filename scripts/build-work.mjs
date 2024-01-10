import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { execa } from 'execa';

import { MyWorker } from './worker.mjs';

runWorker();

function runWorker() {
  if (isMainThread || !MyWorker.is()) {
    return;
  }

  if (!workerData) return;

  if (workerData && workerData._name !== 'scripts_build') {
    return;
  }

  parentPort?.on('message', async data => {
    await build(data, workerData);
    parentPort?.postMessage(null);
  });
}

// build
async function build(
  { target, pkgDir, env },
  { formats, commit, prodOnly, sourceMap }
) {
  // if building a specific format, do not remove dist.
  if (!formats && fs.existsSync(`${pkgDir}/dist`)) {
    await fs.promises.rm(`${pkgDir}/dist`, {
      recursive: true
    });
  }

  // run rollup
  await execa(
    'rollup',
    [
      '-c',
      '--environment',
      [
        `COMMIT:${commit}`,
        `NODE_ENV:${env}`,
        `TARGET:${target}`,
        formats ? `FORMATS:${formats}` : ``,
        prodOnly ? `PROD_ONLY:true` : ``,
        sourceMap ? `SOURCE_MAP:true` : ``
      ]
        .filter(Boolean)
        .join(',')
    ],
    {
      stdio: 'inherit'
    }
  );
}
