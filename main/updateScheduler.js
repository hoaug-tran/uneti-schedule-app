export function createUpdateScheduler({ enabled, check, onError = () => {}, timers = globalThis, initialMs = 15000, intervalMs = 21600000 }) {
  let timer = null;
  let running = false;
  let stopped = true;
  const tick = async () => {
    if (stopped) return;
    if (enabled() && !running) {
      running = true;
      try { await check(); } catch (error) { onError(error); }
      finally { running = false; }
    }
    if (!stopped) timer = timers.setTimeout(tick, intervalMs);
  };
  return {
    start() { if (!stopped) return; stopped = false; timer = timers.setTimeout(tick, initialMs); },
    stop() { stopped = true; if (timer !== null) timers.clearTimeout(timer); timer = null; },
  };
}
