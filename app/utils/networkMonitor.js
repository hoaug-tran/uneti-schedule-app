let isOnline = navigator.onLine;
let listeners = [];

export function isNetworkOnline() {
  return isOnline;
}

export function onNetworkChange(callback) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    window.loggerAPI?.info("[networkMonitor] online");
    isOnline = true;
    listeners.forEach((cb) => cb?.(true));
  });

  window.addEventListener("offline", () => {
    window.loggerAPI?.info("[networkMonitor] offline");
    isOnline = false;
    listeners.forEach((cb) => cb?.(false));
  });
}

export const networkMonitor = {
  isOnline: isNetworkOnline,
  onChange: onNetworkChange,
};
