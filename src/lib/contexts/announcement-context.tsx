"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

interface AnnouncementContextValue {
  announce: (message: string) => void;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

const DEBOUNCE_MS = 500;

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const [announcement, setAnnouncement] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const announce = useCallback((message: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setAnnouncement(message);
    }, DEBOUNCE_MS);
  }, []);

  return (
    <AnnouncementContext.Provider value={{ announce }}>
      {children}
      {/* Screen reader live region - hidden visually */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncement() {
  const context = useContext(AnnouncementContext);
  if (!context) {
    throw new Error("useAnnouncement must be used within an AnnouncementProvider");
  }
  return context;
}
