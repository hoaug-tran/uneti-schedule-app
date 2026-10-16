import { parentPort } from "node:worker_threads";
import { planGpa, simulateGpa, solveCustomGpaPlan } from "../app/utils/gpa.js";
const operations = { plan: planGpa, simulate: simulateGpa, custom: solveCustomGpaPlan };
parentPort.on("message", ({ id, operation, args }) => {
  try {
    if (!Object.hasOwn(operations, operation)) throw new Error("Invalid GPA operation");
    parentPort.postMessage({ id, result: operations[operation](...args) });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
