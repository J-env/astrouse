// Basic port modification of Reacts Scheduler:
// https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/scheduler.ts
// https://github.com/facebook/react/tree/master/packages/scheduler

let taskIdCounter = 1,
  // flush pending
  isCallbackScheduled = false,
  // flushing
  isPerformingWork = false,
  taskQueue: Task[] = [],
  yieldInterval = 5,
  deadline = 0,
  maxYieldInterval = 300,
  currentTask: Task | null | undefined,
  shouldYieldToHost: (() => boolean) | null | undefined,
  // postMessage
  scheduleCallback: VoidFunction | null | undefined,
  scheduledCallback:
    | ((hasTimeRemaining: boolean, initialTime: number) => boolean)
    | null
    | undefined;

const maxSigned31BitInt = 1073741823;

type DidTimeoutCallback = (didTimeout: boolean) => void;

export interface Task {
  id: number;
  fn: DidTimeoutCallback | null;
  startTime: number;
  expiredTime: number;
}

type Handle = Task['id'];

interface Options {
  timeout: number;
}

export function postCallback(fn: DidTimeoutCallback, opts?: Options): Handle {
  return requestCallback(() => requestCallback(fn, opts), opts);
}

/**
 * @see window.cancelIdleCallback()
 */
export function cancelCallback(handle: Handle) {
  for (const task of taskQueue) {
    if (task.id === handle) {
      task.fn = null;
      return;
    }
  }
}

/**
 * @see window.requestIdleCallback()
 */
export function requestCallback(
  fn: DidTimeoutCallback,
  opts?: Options
): Handle {
  if (!scheduleCallback) {
    setupScheduler();
  }

  let startTime = performance.now(),
    timeout = maxSigned31BitInt;

  if (opts && opts.timeout) {
    timeout = opts.timeout;
  }

  const newTask: Task = {
    id: taskIdCounter++,
    fn,
    startTime,
    expiredTime: startTime + timeout
  };

  enqueue(taskQueue, newTask);

  if (!isCallbackScheduled && !isPerformingWork) {
    isCallbackScheduled = true;
    scheduledCallback = flushWork;
    scheduleCallback!();
  }

  return newTask.id;
}

// experimental new feature proposal stuff
type NavigatorScheduling = Navigator & {
  scheduling: { isInputPending?: () => boolean };
};

// setup
function setupScheduler() {
  const channel = new MessageChannel(),
    port = channel.port2;

  const scheduleWork = () => port.postMessage(null);

  scheduleCallback = scheduleWork;

  channel.port1.onmessage = () => {
    if (!scheduledCallback) return;

    const hasTimeRemaining = true;
    const currentTime = performance.now();

    deadline = currentTime + yieldInterval;

    try {
      const hasMoreWork = scheduledCallback(hasTimeRemaining, currentTime);

      if (!hasMoreWork) {
        scheduledCallback = null;
      } else {
        scheduleWork();
      }
    } catch (err) {
      scheduleWork();
      throw err;
    }
  };

  const scheduling = navigator && (navigator as NavigatorScheduling).scheduling;

  if (scheduling && scheduling.isInputPending) {
    shouldYieldToHost = () => {
      const currentTime = performance.now();

      if (currentTime >= deadline) {
        if (scheduling.isInputPending!()) {
          return true;
        }

        return currentTime >= maxYieldInterval;
      } else {
        return false;
      }
    };
  } else {
    shouldYieldToHost = () => performance.now() >= deadline;
  }
}

function enqueue(taskQueue: Task[], task: Task) {
  function findIndex() {
    let m = 0,
      n = taskQueue.length - 1;

    while (m <= n) {
      const k = (n + m) >> 1;
      const cmp = task.expiredTime - taskQueue[k].expiredTime;

      if (cmp > 0) {
        m = k + 1;
      } else if (cmp < 0) {
        n = k - 1;
      } else {
        return k;
      }
    }

    return m;
  }

  taskQueue.splice(findIndex(), 0, task);
}

function flushWork(hasTimeRemaining: boolean, initialTime: number) {
  isCallbackScheduled = false;
  isPerformingWork = true;

  try {
    return workLoop(hasTimeRemaining, initialTime);
  } finally {
    currentTask = null;
    isPerformingWork = false;
  }
}

function workLoop(hasTimeRemaining: boolean, currentTime: number): boolean {
  currentTask = taskQueue[0];

  while (!!currentTask) {
    if (
      currentTask.expiredTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost!())
    ) {
      break;
    }

    const callback = currentTask.fn;

    if (!!callback) {
      currentTask.fn = null;
      callback(currentTask.expiredTime <= currentTime);
      currentTime = performance.now();

      if (currentTask === taskQueue[0]) {
        taskQueue.shift();
      }
    } else {
      taskQueue.shift();
    }

    currentTask = taskQueue[0];
  }

  return !!currentTask;
}
