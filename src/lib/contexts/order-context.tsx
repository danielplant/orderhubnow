"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { OrderQuantities, Product, Currency } from "@/lib/types";
import type { OrderForEditing } from "@/lib/data/queries/orders";

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

/**
 * Per-SKU order line metadata including isOnRoute flag.
 * .NET tracks IsOnRoute per order line based on the "governing cap" rule.
 */
export interface OrderLineMetadata {
  /** True if onRoute > available at time of ordering (ATS) or always true (PreOrder) */
  isOnRoute: boolean;
}

/**
 * Phase 5: Edit mode shipment data.
 * Represents a PlannedShipment loaded from the database when editing an order.
 * Uses real DB IDs (not temp IDs like new order mode).
 */
export interface EditModeShipment {
  id: string;
  collectionId: number | null;
  collectionName: string | null;
  plannedShipStart: string;  // ISO date (YYYY-MM-DD)
  plannedShipEnd: string;
  itemSkus: string[];
  // Collection window constraints for validation (Issue 9 fix)
  shipWindowStart: string | null;
  shipWindowEnd: string | null;
  // Combined shipment tracking (Issue 5 fix - requires Prisma migration)
  isCombined?: boolean;
  originalShipmentIds?: string[] | null;
}

/**
 * Form data stored in draft (partial - user may not have filled everything)
 */
export interface DraftFormData {
  storeName?: string;
  buyerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  salesRepId?: string;
  salesRepName?: string;  // Rep name loaded from draft API for display
  currency?: string;
  street1?: string;
  street2?: string;
  city?: string;
  stateProvince?: string;
  zipPostal?: string;
  country?: string;
  shippingStreet1?: string;
  shippingStreet2?: string;
  shippingCity?: string;
  shippingStateProvince?: string;
  shippingZipPostal?: string;
  shippingCountry?: string;
  shipStartDate?: string;
  shipEndDate?: string;
  customerPO?: string;
  orderNotes?: string;
  website?: string;
}

interface OrderState {
  orders: Record<string, OrderQuantities>;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface OrderContextValue {
  // Cart state
  orders: Record<string, OrderQuantities>;
  totalItems: number;
  totalPrice: number;

  // Cart mutations
  addItem: (productId: string, sku: string, qty: number, price: number, preOrderMeta?: PreOrderItemMetadata, lineMeta?: OrderLineMetadata) => void;
  removeItem: (productId: string, sku: string) => void;
  setQuantity: (productId: string, sku: string, qty: number, price: number, lineMeta?: OrderLineMetadata) => void;
  clearProduct: (productId: string) => void;
  clearAll: () => void;
  undo: () => void;
  canUndo: boolean;
  getProductTotal: (product: Product, currency: Currency) => { items: number; price: number };

  // Pre-order metadata accessors
  preOrderMetadata: Record<string, PreOrderItemMetadata>;
  getPreOrderShipWindow: () => { start: string | null; end: string | null } | null;

  // Order line metadata (isOnRoute tracking)
  orderLineMetadata: Record<string, OrderLineMetadata>;

  // Draft state (server-side persistence)
  draftId: string | null;
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  formData: DraftFormData;
  isLoadingDraft: boolean;

  // Draft methods
  setFormData: (data: DraftFormData) => void;
  updateFormField: (field: keyof DraftFormData, value: string) => void;
  loadDraft: (id: string) => Promise<boolean>;
  clearDraft: () => Promise<void>;
  getDraftUrl: () => string | null;
  saveDraftToServer: (repId: string | null, customerInfo: { storeName: string; buyerName: string; customerEmail: string }) => Promise<string>;

  // Edit mode state (for editing existing orders)
  editOrderId: string | null;
  editOrderCurrency: Currency | null;
  isEditMode: boolean;
  isValidatingEditState: boolean;

  // Phase 5: Edit mode shipments
  editModeShipments: Map<string, EditModeShipment>;
  isEditModeWithShipments: boolean;

  // Edit mode methods
  loadOrderForEdit: (order: OrderForEditing) => void;
  setEditOrderCurrency: (currency: Currency) => void;
  clearEditMode: () => void;

  // Planned shipments - date overrides per shipment
  shipmentDateOverrides: Map<string, { start: string; end: string }>;
  updateShipmentDates: (shipmentId: string, start: string, end: string) => void;
  clearShipmentDateOverrides: () => void;

  // PR-3b: Manual shipment groupings (combine/split)
  // Key: combined shipment ID, Value: array of original shipment IDs
  shipmentGroups: Map<string, string[]>;
  combineShipments: (shipmentIds: string[]) => string;  // Returns new combined ID
  splitShipment: (combinedId: string) => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

const STORAGE_KEY = "draft-order";
const DRAFT_ID_KEY = "draft-id";
const EDIT_STATE_KEY = "edit-order-state";
const MAX_HISTORY = 10;
const DEBOUNCE_MS = 1000; // Auto-save debounce

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

interface StorageData {
  orders: Record<string, OrderQuantities>;
  prices: Map<string, number>;
  preOrderMeta: Record<string, PreOrderItemMetadata>;
  lineMeta: Record<string, OrderLineMetadata>;
  formData: DraftFormData;
  draftId: string | null;
  editOrderId: string | null;
  editOrderCurrency: Currency | null;
  shipmentDateOverrides: Map<string, { start: string; end: string }>;
  // PR-3b: Combined shipment groupings
  shipmentGroups: Map<string, string[]>;
}

/**
 * Safely parse shipmentGroups from JSON, validating types.
 * Returns empty Map if data is malformed.
 */
function safeParseShipmentGroups(data: unknown): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!data || typeof data !== 'object') return result;

  for (const [key, value] of Object.entries(data)) {
    if (typeof key === 'string' && Array.isArray(value) && value.every(v => typeof v === 'string')) {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Safely parse shipmentDateOverrides from JSON, validating types.
 * Returns empty Map if data is malformed.
 */
function safeParseShipmentDateOverrides(
  data: unknown
): Map<string, { start: string; end: string }> {
  const result = new Map<string, { start: string; end: string }>();
  if (!data || typeof data !== 'object') return result;

  for (const [key, value] of Object.entries(data)) {
    if (
      typeof key === 'string' &&
      value &&
      typeof value === 'object' &&
      'start' in value &&
      'end' in value &&
      typeof (value as Record<string, unknown>).start === 'string' &&
      typeof (value as Record<string, unknown>).end === 'string'
    ) {
      result.set(key, value as { start: string; end: string });
    }
  }
  return result;
}

function loadFromStorage(): StorageData {
  if (typeof window === "undefined") {
    return {
      orders: {},
      prices: new Map(),
      preOrderMeta: {},
      lineMeta: {},
      formData: {},
      draftId: null,
      editOrderId: null,
      editOrderCurrency: null,
      shipmentDateOverrides: new Map(),
      shipmentGroups: new Map(),
    };
  }

  // Check for edit state first (takes priority)
  try {
    const editStored = localStorage.getItem(EDIT_STATE_KEY);
    if (editStored) {
      const editState = JSON.parse(editStored);
      return {
        orders: editState.orders || {},
        prices: new Map(Object.entries(editState.prices || {})),
        preOrderMeta: {},
        lineMeta: {},
        formData: {},
        draftId: null,
        editOrderId: editState.orderId || null,
        editOrderCurrency: editState.currency || null,
        shipmentDateOverrides: new Map(), // Edit mode doesn't have shipment overrides
        shipmentGroups: new Map(), // Edit mode doesn't have combined shipments initially
      };
    }
  } catch {
    // Invalid edit state, continue to draft
  }

  // Load draft state
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const draftId = localStorage.getItem(DRAFT_ID_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        orders: parsed.orders || {},
        prices: new Map(Object.entries(parsed.prices || {})),
        preOrderMeta: parsed.preOrderMeta || {},
        lineMeta: parsed.lineMeta || {},
        formData: parsed.formData || {},
        draftId: draftId || null,
        editOrderId: null,
        editOrderCurrency: null,
        shipmentDateOverrides: safeParseShipmentDateOverrides(parsed.shipmentDateOverrides),
        // PR-3b: Restore combined shipment groupings (with type validation)
        shipmentGroups: safeParseShipmentGroups(parsed.shipmentGroups),
      };
    }
  } catch {
    // Invalid storage, start fresh
  }
  return {
    orders: {},
    prices: new Map(),
    preOrderMeta: {},
    lineMeta: {},
    formData: {},
    draftId: null,
    editOrderId: null,
    editOrderCurrency: null,
    shipmentDateOverrides: new Map(),
    shipmentGroups: new Map(),
  };
}

interface OrderProviderProps {
  children: ReactNode;
  initialDraftId?: string; // From ?draft= query param
}

export function OrderProvider({ children, initialDraftId }: OrderProviderProps) {
  // Lazy initialization from localStorage
  const [orders, setOrders] = useState<Record<string, OrderQuantities>>(
    () => loadFromStorage().orders
  );
  const [priceMap, setPriceMap] = useState<Map<string, number>>(
    () => loadFromStorage().prices
  );
  const [preOrderMetadata, setPreOrderMetadata] = useState<Record<string, PreOrderItemMetadata>>(
    () => loadFromStorage().preOrderMeta
  );
  const [orderLineMetadata, setOrderLineMetadata] = useState<Record<string, OrderLineMetadata>>(
    () => loadFromStorage().lineMeta
  );
  const [formData, setFormDataState] = useState<DraftFormData>(
    () => loadFromStorage().formData
  );
  const [history, setHistory] = useState<OrderState[]>([]);
  
  // Draft state
  const [draftId, setDraftId] = useState<string | null>(
    () => initialDraftId || loadFromStorage().draftId
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState<boolean>(!!initialDraftId);

  // Edit mode state (for editing existing orders)
  const [editOrderId, setEditOrderId] = useState<string | null>(
    () => loadFromStorage().editOrderId
  );
  const [editOrderCurrency, setEditOrderCurrency] = useState<Currency | null>(
    () => loadFromStorage().editOrderCurrency
  );
  // Track if we're validating edit state on mount (prevents flash of "Order Not Found")
  const [isValidatingEditState, setIsValidatingEditState] = useState<boolean>(
    () => !!loadFromStorage().editOrderId
  );

  // Phase 5: Edit mode shipments (loaded from DB when editing an order)
  const [editModeShipments, setEditModeShipments] = useState<Map<string, EditModeShipment>>(
    () => new Map()
  );

  // Shipment date overrides - user's custom dates per planned shipment
  const [shipmentDateOverrides, setShipmentDateOverrides] = useState<
    Map<string, { start: string; end: string }>
  >(() => loadFromStorage().shipmentDateOverrides);

  // PR-3b: Manual shipment groupings (combine/split)
  // Key: combined shipment ID, Value: array of original shipment IDs that were merged
  const [shipmentGroups, setShipmentGroups] = useState<Map<string, string[]>>(
    () => loadFromStorage().shipmentGroups
  );

  // Refs for debounced auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef(false);
  // Track if a sync is currently in flight (prevents race conditions)
  const syncInFlightRef = useRef(false);

  // Save state to localStorage (local session backup)
  const saveToLocalStorage = useCallback(() => {
    // In edit mode, save to edit-specific storage
    if (editOrderId) {
      const editData = {
        orderId: editOrderId,
        currency: editOrderCurrency,
        orders,
        prices: Object.fromEntries(priceMap),
      };
      localStorage.setItem(EDIT_STATE_KEY, JSON.stringify(editData));
      return;
    }

    // Normal session backup storage (local only)
    const data = {
      orders,
      prices: Object.fromEntries(priceMap),
      preOrderMeta: preOrderMetadata,
      lineMeta: orderLineMetadata,
      formData,
      shipmentDateOverrides: Object.fromEntries(shipmentDateOverrides),
      // PR-3b: Persist combined shipment groupings
      shipmentGroups: Object.fromEntries(
        Array.from(shipmentGroups.entries()).map(([k, v]) => [k, v])
      ),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (draftId) {
      localStorage.setItem(DRAFT_ID_KEY, draftId);
    }
  }, [orders, priceMap, preOrderMetadata, orderLineMetadata, formData, shipmentDateOverrides, shipmentGroups, draftId, editOrderId, editOrderCurrency]);

  // Sync to localStorage when state changes and update local backup status
  useEffect(() => {
    saveToLocalStorage();
    // Update status to reflect local backup is saved (only if we have items)
    const itemCount = Object.values(orders).reduce(
      (sum, productOrders) => sum + Object.values(productOrders).reduce((s, q) => s + q, 0),
      0
    );
    if (itemCount > 0 && !editOrderId) {
      setSaveStatus('saved');
      setLastSaved(new Date());
    }
  }, [saveToLocalStorage, orders, editOrderId]);

  // Create or ensure draft exists on server
  const ensureDraft = useCallback(async (repId?: string | null): Promise<string> => {
    if (draftId) return draftId;
    
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currency: formData.currency || 'CAD',
          repId: repId || null,
        }),
      });
      
      if (!res.ok) throw new Error('Failed to create draft');
      
      const data = await res.json();
      const newDraftId = data.id;
      
      setDraftId(newDraftId);
      localStorage.setItem(DRAFT_ID_KEY, newDraftId);
      
      return newDraftId;
    } catch (err) {
      console.error('Failed to create draft:', err);
      throw err;
    }
  }, [draftId, formData.currency]);

  // Sync current state to server
  const syncToServer = useCallback(async (id: string) => {
    // Guard: skip if draft was cleared (draftId is null)
    // This prevents "Failed to sync draft" errors after order submission
    if (!draftId) {
      return;
    }

    // Guard: skip if another sync is already in flight (prevents race conditions)
    if (syncInFlightRef.current) {
      return;
    }
    syncInFlightRef.current = true;

    setSaveStatus('saving');

    try {
      const res = await fetch(`/api/drafts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders,
          prices: Object.fromEntries(priceMap),
          preOrderMeta: preOrderMetadata,
          lineMeta: orderLineMetadata,
          formData,
          shipmentDateOverrides: Object.fromEntries(shipmentDateOverrides),
          currency: formData.currency || 'CAD',
          // Add shipmentGroups for cross-device persistence
          shipmentGroups: Object.fromEntries(
            Array.from(shipmentGroups.entries()).map(([k, v]) => [k, v])
          ),
        }),
      });

      // Silently ignore 404 (draft was deleted) to prevent error noise after order submission
      if (res.status === 404) {
        setSaveStatus('idle');
        return;
      }

      if (!res.ok) throw new Error('Failed to sync draft');

      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (err) {
      console.error('Failed to sync to server:', err);
      setSaveStatus('error');
    } finally {
      syncInFlightRef.current = false;
    }
  }, [orders, priceMap, preOrderMetadata, orderLineMetadata, formData, shipmentDateOverrides, draftId, shipmentGroups]);

  // Debounced auto-save to server (skip in edit mode or after draft cleared)
  const _scheduleServerSync = useCallback(() => {
    // Skip server sync in edit mode - edit state is only stored locally
    if (editOrderId) return;
    
    // Skip if draft was already cleared (order was submitted)
    if (!draftId && !pendingSaveRef.current) {
      return;
    }

    // Clear any pending timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    pendingSaveRef.current = true;

    saveTimeoutRef.current = setTimeout(async () => {
      if (!pendingSaveRef.current) return;
      pendingSaveRef.current = false;

      try {
        const id = await ensureDraft();
        await syncToServer(id);
      } catch {
        // Error already logged
      }
    }, DEBOUNCE_MS);
  }, [ensureDraft, syncToServer, editOrderId, draftId]);

  // Update dates for a specific shipment
  const updateShipmentDates = useCallback(
    (shipmentId: string, start: string, end: string) => {
      setShipmentDateOverrides((prev) => {
        const next = new Map(prev);
        next.set(shipmentId, { start, end });
        return next;
      });
      // Local backup only - server draft created via explicit Save Draft action
    },
    []
  );

  // Clear all shipment date overrides
  const clearShipmentDateOverrides = useCallback(() => {
    setShipmentDateOverrides(new Map());
  }, []);

  // PR-3b: Combine multiple shipments into one
  // Returns the ID of the new combined shipment
  const combineShipments = useCallback((shipmentIds: string[]): string => {
    if (shipmentIds.length < 2) {
      console.warn('[OrderContext] combineShipments requires at least 2 shipment IDs');
      return shipmentIds[0] || '';
    }

    // Generate a combined shipment ID
    const combinedId = `combined-${Date.now()}`;

    setShipmentGroups((prev) => {
      const next = new Map(prev);
      // Store the original shipment IDs under the combined ID
      next.set(combinedId, shipmentIds);
      return next;
    });

    return combinedId;
  }, []);

  // PR-3b: Split a combined shipment back into its originals
  const splitShipment = useCallback((combinedId: string) => {
    setShipmentGroups((prev) => {
      const next = new Map(prev);
      next.delete(combinedId);
      return next;
    });

    // Also clear any date overrides for the combined shipment
    setShipmentDateOverrides((prev) => {
      const next = new Map(prev);
      next.delete(combinedId);
      return next;
    });
  }, []);

  // Load draft from server
  const loadDraft = useCallback(async (id: string): Promise<boolean> => {
    setIsLoadingDraft(true);
    try {
      const res = await fetch(`/api/drafts/${id}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          // Draft not found, clear local reference
          localStorage.removeItem(DRAFT_ID_KEY);
          setDraftId(null);
          setIsLoadingDraft(false);
          return false;
        }
        throw new Error('Failed to load draft');
      }
      
      const data = await res.json();
      const state = data.state;

      // Merge salesRep from API response into formData for display purposes
      const formDataWithRep = {
        ...state.formData,
        // If API returned salesRep (rep name), store it for modal display
        ...(data.salesRep && { salesRepName: data.salesRep }),
      };

      // Update all state from server
      setOrders(state.orders || {});
      setPriceMap(new Map(Object.entries(state.prices || {})));
      setPreOrderMetadata(state.preOrderMeta || {});
      setOrderLineMetadata(state.lineMeta || {});
      setFormDataState(formDataWithRep);
      setShipmentDateOverrides(safeParseShipmentDateOverrides(state.shipmentDateOverrides));
      // Restore combined shipment groupings from server draft (with type validation)
      setShipmentGroups(safeParseShipmentGroups(state.shipmentGroups));
      setDraftId(id);
      setSaveStatus('saved');
      setLastSaved(new Date(state.lastUpdated || Date.now()));
      
      // Update localStorage
      localStorage.setItem(DRAFT_ID_KEY, id);
      
      setIsLoadingDraft(false);
      return true;
    } catch (err) {
      console.error('Failed to load draft:', err);
      setIsLoadingDraft(false);
      return false;
    }
  }, []);

  // Clear draft (server + localStorage)
  const clearDraft = useCallback(async () => {
    // IMPORTANT: Cancel any pending auto-save to prevent "Failed to sync draft" errors
    // This must happen BEFORE deleting the draft from server
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = false;
    
    // Clear server draft if exists
    if (draftId) {
      try {
        await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' });
      } catch {
        // Ignore delete errors
      }
    }
    
    // Clear all state
    setOrders({});
    setPriceMap(new Map());
    setPreOrderMetadata({});
    setOrderLineMetadata({});
    setFormDataState({});
    setShipmentDateOverrides(new Map());
    setShipmentGroups(new Map());
    setDraftId(null);
    setSaveStatus('idle');
    setLastSaved(null);
    setHistory([]);
    
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DRAFT_ID_KEY);
  }, [draftId]);

  // Get shareable draft URL
  const getDraftUrl = useCallback(() => {
    if (!draftId) return null;
    if (typeof window === 'undefined') return null;
    return `${window.location.origin}/draft/${draftId}`;
  }, [draftId]);

  /**
   * Explicitly save draft to server with customer info.
   * This is the intentional "Save Draft" action (vs local autosave).
   * Returns the draft ID on success.
   */
  const saveDraftToServer = useCallback(async (
    repId: string | null,
    customerInfo: { storeName: string; buyerName: string; customerEmail: string }
  ): Promise<string> => {
    setSaveStatus('saving');
    
    try {
      // Update form data with customer info and rep
      const updatedFormData = {
        ...formData,
        storeName: customerInfo.storeName,
        buyerName: customerInfo.buyerName,
        customerEmail: customerInfo.customerEmail,
        salesRepId: repId || undefined,
      };
      setFormDataState(updatedFormData);

      // Cancel any pending auto-save to prevent race condition
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      pendingSaveRef.current = false;

      // Wait for any in-flight sync to complete before saving
      while (syncInFlightRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Ensure draft exists on server (creates if needed, with rep attribution)
      const id = await ensureDraft(repId);
      
      // Sync full state to server
      const res = await fetch(`/api/drafts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders,
          prices: Object.fromEntries(priceMap),
          preOrderMeta: preOrderMetadata,
          lineMeta: orderLineMetadata,
          formData: updatedFormData,
          shipmentDateOverrides: Object.fromEntries(shipmentDateOverrides),
          shipmentGroups: Object.fromEntries(
            Array.from(shipmentGroups.entries()).map(([k, v]) => [k, v])
          ),
          currency: updatedFormData.currency || 'CAD',
          repId, // Include repId for PUT to preserve attribution
        }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to save draft');
      }
      
      setSaveStatus('saved');
      setLastSaved(new Date());
      
      // Update localStorage with draft ID
      localStorage.setItem(DRAFT_ID_KEY, id);
      
      return id;
    } catch (err) {
      console.error('Failed to save draft to server:', err);
      setSaveStatus('error');
      throw err;
    }
  }, [formData, orders, priceMap, preOrderMetadata, orderLineMetadata, shipmentDateOverrides, shipmentGroups, ensureDraft]);

  // Load existing order into cart for editing
  const loadOrderForEdit = useCallback((order: OrderForEditing) => {
    // Clear any existing cart state
    setOrders({});
    setPriceMap(new Map());
    setPreOrderMetadata({});
    setOrderLineMetadata({});
    setHistory([]);
    setShipmentDateOverrides(new Map());
    setShipmentGroups(new Map());
    setEditModeShipments(new Map());

    // Set edit mode state
    setEditOrderId(order.id);
    setEditOrderCurrency(order.currency);

    // Populate cart with order items
    const newOrders: Record<string, OrderQuantities> = {};
    const newPrices = new Map<string, number>();

    order.items.forEach((item) => {
      // Use SKU as productId since we don't have the original productId in edit mode
      if (!newOrders[item.sku]) {
        newOrders[item.sku] = {};
      }
      newOrders[item.sku][item.sku] = item.quantity;
      newPrices.set(item.sku, item.price);
    });

    setOrders(newOrders);
    setPriceMap(newPrices);

    // Phase 5: Load planned shipments with their saved dates
    if (order.plannedShipments && order.plannedShipments.length > 0) {
      const shipmentsMap = new Map<string, EditModeShipment>();
      const overridesMap = new Map<string, { start: string; end: string }>();

      order.plannedShipments.forEach((ps) => {
        shipmentsMap.set(ps.id, ps);
        // Set overrides to preserve user's dates (not collection defaults)
        overridesMap.set(ps.id, {
          start: ps.plannedShipStart,
          end: ps.plannedShipEnd,
        });
      });

      setEditModeShipments(shipmentsMap);
      setShipmentDateOverrides(overridesMap);
    }

    // Save edit state to localStorage
    const editData = {
      orderId: order.id,
      currency: order.currency,
      orders: newOrders,
      prices: Object.fromEntries(newPrices),
    };
    localStorage.setItem(EDIT_STATE_KEY, JSON.stringify(editData));
  }, []);

  // Update edit order currency (after saving to server)
  const updateEditOrderCurrency = useCallback((newCurrency: Currency) => {
    setEditOrderCurrency(newCurrency);

    // Update localStorage edit state
    const editStored = localStorage.getItem(EDIT_STATE_KEY);
    if (editStored) {
      try {
        const editState = JSON.parse(editStored);
        editState.currency = newCurrency;
        localStorage.setItem(EDIT_STATE_KEY, JSON.stringify(editState));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Clear edit mode and return to normal cart state
  const clearEditMode = useCallback(() => {
    setEditOrderId(null);
    setEditOrderCurrency(null);
    setOrders({});
    setPriceMap(new Map());
    setHistory([]);

    // Phase 5: Clear edit mode shipments and date overrides
    setEditModeShipments(new Map());
    setShipmentDateOverrides(new Map());
    setShipmentGroups(new Map());

    // Clear edit state from localStorage
    localStorage.removeItem(EDIT_STATE_KEY);
  }, []);

  /**
   * Validate that the edit order still exists and is editable on the server.
   * Clears stale edit state if order not found (404) or no longer editable.
   * Returns true if valid, false if cleared.
   */
  const validateEditState = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/orders/${orderId}/exists`);

      if (!res.ok || res.status === 404) {
        // Order not found - clear stale edit state
        console.warn(`[OrderContext] Edit order ${orderId} not found, clearing stale state`);
        setEditOrderId(null);
        setEditOrderCurrency(null);
        setOrders({});
        setPriceMap(new Map());
        setHistory([]);
        localStorage.removeItem(EDIT_STATE_KEY);
        return false;
      }

      const data = await res.json();

      if (!data.editable) {
        // Order exists but is no longer editable (status changed)
        console.warn(`[OrderContext] Edit order ${orderId} is no longer editable, clearing state`);
        setEditOrderId(null);
        setEditOrderCurrency(null);
        setOrders({});
        setPriceMap(new Map());
        setHistory([]);
        localStorage.removeItem(EDIT_STATE_KEY);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[OrderContext] Failed to validate edit state:', err);
      // On network error, keep state (user may be offline)
      return true;
    }
  }, []);

  // Load initial draft from URL param or localStorage, validate edit state
  useEffect(() => {
    const loadInitialState = async () => {
      // First: Validate edit state if present in localStorage
      const storedEditState = loadFromStorage();
      if (storedEditState.editOrderId && !initialDraftId) {
        // We have edit state from localStorage - validate it exists on server
        const isValid = await validateEditState(storedEditState.editOrderId);
        setIsValidatingEditState(false);

        if (!isValid) {
          // Edit state was cleared, check for draft instead
          const storedDraftId = localStorage.getItem(DRAFT_ID_KEY);
          if (storedDraftId) {
            await loadDraft(storedDraftId);
          }
          return;
        }
        // Edit state is valid, keep using it
        return;
      }

      // No edit state to validate
      setIsValidatingEditState(false);

      // Second: Load draft if present
      if (initialDraftId) {
        // URL has draft param - load from server (overrides localStorage)
        await loadDraft(initialDraftId);
      } else {
        // Check localStorage for existing draft ID
        const storedDraftId = localStorage.getItem(DRAFT_ID_KEY);
        if (storedDraftId) {
          // Background sync from server
          loadDraft(storedDraftId);
        }
      }
    };

    loadInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId]);

  // Listen for changes from other tabs
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setOrders(parsed.orders || {});
          setPriceMap(new Map(Object.entries(parsed.prices || {})));
          setPreOrderMetadata(parsed.preOrderMeta || {});
          setOrderLineMetadata(parsed.lineMeta || {});
          setFormDataState(parsed.formData || {});
        } catch {
          // Ignore invalid data
        }
      }
      if (e.key === DRAFT_ID_KEY) {
        setDraftId(e.newValue);
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const saveToHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), { orders }]);
  }, [orders]);

  const addItem = useCallback(
    (productId: string, sku: string, qty: number, price: number, preOrderMeta?: PreOrderItemMetadata, lineMeta?: OrderLineMetadata) => {
      saveToHistory();
      setPriceMap((prev) => new Map(prev).set(sku, price));
      setOrders((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          [sku]: (prev[productId]?.[sku] || 0) + qty,
        },
      }));
      if (preOrderMeta) {
        setPreOrderMetadata((prev) => ({ ...prev, [sku]: preOrderMeta }));
      }
      if (lineMeta) {
        setOrderLineMetadata((prev) => ({ ...prev, [sku]: lineMeta }));
      }
      // Local backup only - server draft created via explicit Save Draft action
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
      // Local backup only - server draft created via explicit Save Draft action
    },
    [saveToHistory]
  );

  const setQuantity = useCallback(
    (productId: string, sku: string, qty: number, price: number, lineMeta?: OrderLineMetadata) => {
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
        setOrderLineMetadata((prev) => {
          const next = { ...prev };
          delete next[sku];
          return next;
        });
      } else {
        setOrders((prev) => ({
          ...prev,
          [productId]: { ...prev[productId], [sku]: qty },
        }));
        if (lineMeta) {
          setOrderLineMetadata((prev) => ({ ...prev, [sku]: lineMeta }));
        }
      }
      // Local backup only - server draft created via explicit Save Draft action
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
      // Local backup only - server draft created via explicit Save Draft action
    },
    [saveToHistory]
  );

  const clearAll = useCallback(() => {
    saveToHistory();
    setOrders({});
    setPreOrderMetadata({});
    setOrderLineMetadata({});
    setShipmentDateOverrides(new Map());
    setShipmentGroups(new Map());
    // Local backup only - server draft created via explicit Save Draft action
  }, [saveToHistory]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setOrders(previousState.orders);
    // Local backup only - server draft created via explicit Save Draft action
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

  const getPreOrderShipWindow = useCallback(() => {
    const metaValues = Object.values(preOrderMetadata);
    if (metaValues.length === 0) return null;
    const first = metaValues.find((m) => m.onRouteStart || m.onRouteEnd);
    if (!first) return null;
    return { start: first.onRouteStart, end: first.onRouteEnd };
  }, [preOrderMetadata]);

  const setFormData = useCallback((data: DraftFormData) => {
    setFormDataState(data);
    // Local backup only - server draft created via explicit Save Draft action
  }, []);

  const updateFormField = useCallback((field: keyof DraftFormData, value: string) => {
    setFormDataState((prev) => ({ ...prev, [field]: value }));
    // Local backup only - server draft created via explicit Save Draft action
  }, []);

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
        orderLineMetadata,
        // Draft state
        draftId,
        saveStatus,
        lastSaved,
        formData,
        isLoadingDraft,
        // Draft methods
        setFormData,
        updateFormField,
        loadDraft,
        clearDraft,
        getDraftUrl,
        saveDraftToServer,
        // Edit mode state
        editOrderId,
        editOrderCurrency,
        isEditMode: !!editOrderId,
        isValidatingEditState,
        // Phase 5: Edit mode shipments
        editModeShipments,
        isEditModeWithShipments: !!editOrderId && editModeShipments.size > 0,
        // Edit mode methods
        loadOrderForEdit,
        setEditOrderCurrency: updateEditOrderCurrency,
        clearEditMode,
        // Planned shipments - date overrides
        shipmentDateOverrides,
        updateShipmentDates,
        clearShipmentDateOverrides,
        // PR-3b: Manual shipment groupings
        shipmentGroups,
        combineShipments,
        splitShipment,
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
