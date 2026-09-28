import { useSyncExternalStore } from 'react';
let ready = false;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function finishStartup() { ready = true; listeners.forEach(listener => listener()); }
export function useStartupReady() { return useSyncExternalStore(subscribe, () => ready, () => false); }
