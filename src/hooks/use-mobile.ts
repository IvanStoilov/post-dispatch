"use client";
import { useSyncExternalStore } from "react";
const query = "(max-width: 767px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function snapshot() {
  return window.matchMedia(query).matches;
}
function serverSnapshot() {
  return false;
}
export function useIsMobile() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
