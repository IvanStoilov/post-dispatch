"use client";
import { createContext, useContext, useCallback } from "react";
import { applicationPath } from "@/lib/route-paths";

const AppNavigation = createContext<boolean | null>(null);
export function AppNavigationProvider({
  cleanHost,
  children,
}: {
  cleanHost: boolean;
  children: React.ReactNode;
}) {
  return (
    <AppNavigation.Provider value={cleanHost}>
      {children}
    </AppNavigation.Provider>
  );
}
export function useAppPath() {
  const cleanHost = useContext(AppNavigation);
  // Public branding links to the public homepage outside the app layout.
  return useCallback(
    (path = "/") =>
      cleanHost === null ? path : applicationPath(path, cleanHost),
    [cleanHost],
  );
}
