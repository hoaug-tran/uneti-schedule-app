import { Worker } from "node:worker_threads";
let worker;
let sequence = 0;
const jobs = new Map();
function rejectAll(error) { for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(error); } jobs.clear(); }
export function runGpa(operation, ...args) {
  if (jobs.size >= 32) return Promise.reject(new Error("GPA calculation busy; please retry"));
  if (!worker) {
    worker = new Worker(new URL("./gpaWorker.js", import.meta.url));
    const ownWorker = worker;
    worker.on("message", ({ id, result, error }) => {
      const job = jobs.get(id); if (!job) return;
      clearTimeout(job.timer); jobs.delete(id);
      if (error) job.reject(new Error(error)); else job.resolve(result);
      if (!jobs.size) ownWorker.unref();
    });
    worker.on("error", error => { if (worker === ownWorker) { rejectAll(error); worker = null; } });
    worker.on("exit", () => { if (worker === ownWorker) { rejectAll(new Error("GPA worker stopped")); worker = null; } });
  }
  worker.ref();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const stopped = worker; worker = null;
      rejectAll(new Error("GPA calculation timed out"));
      stopped?.terminate().catch(() => {});
    }, 15000);
    jobs.set(id, { resolve, reject, timer });
    try { worker.postMessage({ id, operation, args }); }
    catch (error) { clearTimeout(timer); jobs.delete(id); reject(error); if (!jobs.size) worker.unref(); }
  });
}
export async function closeGpaWorker() {
  const stopped = worker; worker = null;
  rejectAll(new Error("GPA worker shutting down"));
  if (stopped) await stopped.terminate();
}
