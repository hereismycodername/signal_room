"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

// Server and first client render agree; wallet state is displayed after hydration.
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
