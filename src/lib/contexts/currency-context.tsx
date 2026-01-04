"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Currency } from "@/lib/types";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const STORAGE_KEY = "currency-preference";
const DEFAULT_CURRENCY: Currency = "CAD";

// Listeners for external store
let listeners: Array<() => void> = [];

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): Currency {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "CAD" || stored === "USD") {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_CURRENCY;
}

function getServerSnapshot(): Currency {
  return DEFAULT_CURRENCY;
}

// Listen for changes from other tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      emitChange();
    }
  });
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const currency = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCurrency = useCallback((newCurrency: Currency) => {
    localStorage.setItem(STORAGE_KEY, newCurrency);
    emitChange();
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
