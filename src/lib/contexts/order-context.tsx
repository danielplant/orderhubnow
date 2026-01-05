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

/**
 * Pre-order metadata for tracking category/ship window per item.
 * Used for display during checkout; not persisted to DB (per .NET parity).
 */
export interface PreOrderItemMetadata {
  categoryId: number;
  categoryName: string;
  onRouteStart: string | null;
  onRouteEnd: string | null;
}

interface OrderState {
  orders: Record<string, OrderQuantities>;
}

interface OrderContextValue {
  orders: Record<string, OrderQuantities>;
  totalItems: number;
  totalPrice: number;
  addItem: (productId: string, sku: string, qty: number, price: number, preOrderMeta?: PreOrderItemMetadata) => void;
  removeItem: (productId: string, sku: string) => void;
  setQuantity: (productId: string, sku: string, qty: number, price: number) => void;
  clearProduct: (productId: string) => void;
  clearAll: () => void;
  undo: () => void;
  canUndo: boolean;
  getProductTotal: (product: Product, currency: Currency) => { items: number; price: number };
  // Pre-order metadata accessors
  preOrderMetadata: Record<string, PreOrderItemMetadata>;
  getPreOrderShipWindow: () => { start: string | null; end: string | null } | null;
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
  preOrderMeta: Record<string, PreOrderItemMetadata>;
} {
  if (typeof window === "undefined") {
    return { orders: {}, prices: new Map(), preOrderMeta: {} };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        orders: parsed.orders || {},
        prices: new Map(Object.entries(parsed.prices || {})),
        preOrderMeta: parsed.preOrderMeta || {},
      };
    }
  } catch {
    // Invalid storage, start fresh
  }
  return { orders: {}, prices: new Map(), preOrderMeta: {} };
}

export function OrderProvider({ children }: { children: ReactNode }) {
  // Lazy initialization from localStorage (runs once during first render)
  const [orders, setOrders] = useState<Record<string, OrderQuantities>>(
    () => loadFromStorage().orders
  );
  const [priceMap, setPriceMap] = useState<Map<string, number>>(
    () => loadFromStorage().prices
  );
  const [preOrderMetadata, setPreOrderMetadata] = useState<Record<string, PreOrderItemMetadata>>(
    () => loadFromStorage().preOrderMeta
  );
  const [history, setHistory] = useState<OrderState[]>([]);

  // Sync to localStorage when orders/prices/preOrderMeta change
  useEffect(() => {
    const data = {
      orders,
      prices: Object.fromEntries(priceMap),
      preOrderMeta: preOrderMetadata,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [orders, priceMap, preOrderMetadata]);

  // Listen for changes from other tabs (callback-based, not synchronous)
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setOrders(parsed.orders || {});
          setPriceMap(new Map(Object.entries(parsed.prices || {})));
          setPreOrderMetadata(parsed.preOrderMeta || {});
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
    (productId: string, sku: string, qty: number, price: number, preOrderMeta?: PreOrderItemMetadata) => {
      saveToHistory();
      setPriceMap((prev) => new Map(prev).set(sku, price));
      setOrders((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          [sku]: (prev[productId]?.[sku] || 0) + qty,
        },
      }));
      // Store pre-order metadata if provided (keyed by SKU)
      if (preOrderMeta) {
        setPreOrderMetadata((prev) => ({
          ...prev,
          [sku]: preOrderMeta,
        }));
      }
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
    setPreOrderMetadata({});
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

  /**
   * Get the suggested ship window from pre-order metadata.
   * If items span multiple categories with different windows, returns the first one found.
   * User can edit this on the checkout form per .NET behavior.
   */
  const getPreOrderShipWindow = useCallback(() => {
    const metaValues = Object.values(preOrderMetadata);
    if (metaValues.length === 0) return null;
    // Return first available ship window
    const first = metaValues.find((m) => m.onRouteStart || m.onRouteEnd);
    if (!first) return null;
    return { start: first.onRouteStart, end: first.onRouteEnd };
  }, [preOrderMetadata]);

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
        preOrderMetadata,
        getPreOrderShipWindow,
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
