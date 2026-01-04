"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { OrderQuantities, Product, Currency } from "@/lib/types";

interface OrderState {
  orders: Record<string, OrderQuantities>;
}

interface OrderContextValue {
  orders: Record<string, OrderQuantities>;
  totalItems: number;
  totalPrice: number;
  addItem: (productId: string, sku: string, qty: number, price: number) => void;
  removeItem: (productId: string, sku: string) => void;
  setQuantity: (productId: string, sku: string, qty: number, price: number) => void;
  clearProduct: (productId: string) => void;
  clearAll: () => void;
  undo: () => void;
  canUndo: boolean;
  getProductTotal: (product: Product, currency: Currency) => { items: number; price: number };
}

const OrderContext = createContext<OrderContextValue | null>(null);

const STORAGE_KEY = "draft-order";
const MAX_HISTORY = 10;

function calculateTotals(
  orders: Record<string, OrderQuantities>,
  priceMap: Map<string, number>
): { items: number; price: number } {
  let items = 0;
  let price = 0;
  Object.values(orders).forEach((productOrders) => {
    Object.entries(productOrders).forEach(([sku, qty]) => {
      items += qty;
      price += qty * (priceMap.get(sku) || 0);
    });
  });
  return { items, price };
}

function loadFromStorage(): {
  orders: Record<string, OrderQuantities>;
  prices: Map<string, number>;
} {
  if (typeof window === "undefined") {
    return { orders: {}, prices: new Map() };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        orders: parsed.orders || {},
        prices: new Map(Object.entries(parsed.prices || {})),
      };
    }
  } catch {
    // Invalid storage, start fresh
  }
  return { orders: {}, prices: new Map() };
}

export function OrderProvider({ children }: { children: ReactNode }) {
  // Lazy initialization from localStorage (runs once during first render)
  const [orders, setOrders] = useState<Record<string, OrderQuantities>>(
    () => loadFromStorage().orders
  );
  const [priceMap, setPriceMap] = useState<Map<string, number>>(
    () => loadFromStorage().prices
  );
  const [history, setHistory] = useState<OrderState[]>([]);

  // Sync to localStorage when orders/prices change
  useEffect(() => {
    const data = {
      orders,
      prices: Object.fromEntries(priceMap),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [orders, priceMap]);

  // Listen for changes from other tabs (callback-based, not synchronous)
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setOrders(parsed.orders || {});
          setPriceMap(new Map(Object.entries(parsed.prices || {})));
        } catch {
          // Ignore invalid data
        }
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const saveToHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), { orders }]);
  }, [orders]);

  const addItem = useCallback(
    (productId: string, sku: string, qty: number, price: number) => {
      saveToHistory();
      setPriceMap((prev) => new Map(prev).set(sku, price));
      setOrders((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          [sku]: (prev[productId]?.[sku] || 0) + qty,
        },
      }));
    },
    [saveToHistory]
  );

  const removeItem = useCallback(
    (productId: string, sku: string) => {
      saveToHistory();
      setOrders((prev) => {
        const productOrders = { ...prev[productId] };
        delete productOrders[sku];
        if (Object.keys(productOrders).length === 0) {
          const next = { ...prev };
          delete next[productId];
          return next;
        }
        return { ...prev, [productId]: productOrders };
      });
    },
    [saveToHistory]
  );

  const setQuantity = useCallback(
    (productId: string, sku: string, qty: number, price: number) => {
      saveToHistory();
      setPriceMap((prev) => new Map(prev).set(sku, price));
      if (qty <= 0) {
        setOrders((prev) => {
          const productOrders = { ...prev[productId] };
          delete productOrders[sku];
          if (Object.keys(productOrders).length === 0) {
            const next = { ...prev };
            delete next[productId];
            return next;
          }
          return { ...prev, [productId]: productOrders };
        });
      } else {
        setOrders((prev) => ({
          ...prev,
          [productId]: {
            ...prev[productId],
            [sku]: qty,
          },
        }));
      }
    },
    [saveToHistory]
  );

  const clearProduct = useCallback(
    (productId: string) => {
      saveToHistory();
      setOrders((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    },
    [saveToHistory]
  );

  const clearAll = useCallback(() => {
    saveToHistory();
    setOrders({});
  }, [saveToHistory]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setOrders(previousState.orders);
  }, [history]);

  const getProductTotal = useCallback(
    (product: Product, currency: Currency) => {
      const productOrders = orders[product.id] || {};
      let items = 0;
      let price = 0;
      product.variants.forEach((v) => {
        const qty = productOrders[v.sku] || 0;
        const variantPrice = currency === "CAD" ? v.priceCad : v.priceUsd;
        items += qty;
        price += qty * variantPrice;
      });
      return { items, price };
    },
    [orders]
  );

  const { items: totalItems, price: totalPrice } = calculateTotals(orders, priceMap);

  return (
    <OrderContext.Provider
      value={{
        orders,
        totalItems,
        totalPrice,
        addItem,
        removeItem,
        setQuantity,
        clearProduct,
        clearAll,
        undo,
        canUndo: history.length > 0,
        getProductTotal,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrder must be used within an OrderProvider");
  }
  return context;
}
