import { cpus } from 'node:os';
import { Worker, workerData } from 'node:worker_threads';

const myFlag = '__WORKER_MY_FLAG';
const _config = {
  [myFlag]: '__WORKER_MY_FLAG_xxx***123==__'
};

function genWorkerCode(fn) {
  return `
  import { parentPort } from 'node:worker_threads'

  const doWork = ${fn.toString()}

  parentPort.on('message', async (data) => {
    const res = await doWork(data)
    parentPort.postMessage(res)
  })
  `;
}

export class MyWorker {
  static is() {
    return !!(workerData && workerData[myFlag] === _config[myFlag]);
  }

  #pool = [];
  #idlePool = [];
  #queue = [];

  constructor(filename, options = {}) {
    const isFunc = typeof filename === 'function';
    this.max = options.max || Math.max(1, cpus().length - 1);
    this.filename = isFunc ? genWorkerCode(filename) : filename;
    this.eval = isFunc;
    this.name = options.name;

    if (options.workerData) {
      Object.assign(options.workerData, _config);
      this.workerData = options.workerData;
    } else {
      this.workerData = _config;
    }
  }

  async run(data) {
    const worker = await this.#getAvailableWorker();
    return new Promise((resolve, reject) => {
      worker.__resolve = resolve;
      worker.__reject = reject;
      worker.postMessage(data);
    });
  }

  destroy() {
    for (const worker of this.#pool) {
      worker.unref();
      worker.terminate();
    }

    for (const [, reject] of this.#queue) {
      reject(
        new Error('Main worker pool stopped before a worker was available.')
      );
    }

    this.#pool = [];
    this.#idlePool = [];
    this.#queue = [];
  }

  async #getAvailableWorker() {
    if (this.#idlePool.length) {
      return this.#idlePool.shift();
    }

    if (this.#pool.length < this.max) {
      const worker = new Worker(this.filename, {
        eval: this.eval,
        workerData: this.workerData,
        name: this.name
      });

      worker.on('message', res => {
        // @ts-expect-error
        worker.__resolve?.(res);
        // @ts-expect-error
        worker.__resolve = null;
        this.#assignDoneWorker(worker);
      });

      worker.on('error', err => {
        // @ts-expect-error
        worker.__reject?.(err);
        // @ts-expect-error
        worker.__reject = null;
      });

      worker.on('exit', code => {
        const i = this.#pool.indexOf(worker);
        if (i > -1) {
          this.#pool.splice(i, 1);
        }

        // @ts-expect-error
        if (code !== 0 && worker.__reject) {
          // @ts-expect-error
          worker.__reject(
            new Error(`Worker stopped with non-0 exit code ${code}`)
          );

          // @ts-expect-error
          worker.__reject = null;
        }
      });

      this.#pool.push(worker);
      return worker;
    }

    let resolve;
    let reject;

    const onWorkerAvailablePromise = new Promise((_res, _rej) => {
      resolve = _res;
      reject = _rej;
    });

    this.#queue.push([resolve, reject]);
    return onWorkerAvailablePromise;
  }

  #assignDoneWorker(worker) {
    if (this.#queue.length) {
      const [resolve] = this.#queue.shift();
      return resolve(worker);
    }
    this.#idlePool.push(worker);
  }
}
