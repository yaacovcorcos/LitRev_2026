import { Project } from "@/types/project";

const PROJECTS_KEY = "litrev_projects_v1";
const SORT_KEY = "litrev_sort_preference";
const VIEW_KEY = "litrev_view_preference";

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadProjects(fallback: Project[]): Project[] {
  if (!isBrowser()) return fallback;
  try {
    const stored = window.localStorage.getItem(PROJECTS_KEY);
    if (!stored) {
      window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    console.warn("loadProjects parse failed, using fallback", err);
  }
  window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(fallback));
  return fallback;
}

export function loadSortPreference(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(SORT_KEY);
  } catch {
    return null;
  }
}

export function saveSortPreference(value: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(SORT_KEY, value);
  } catch (err) {
    console.warn("saveSortPreference failed", err);
  }
}

export function loadViewPreference(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}

export function saveViewPreference(value: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(VIEW_KEY, value);
  } catch (err) {
    console.warn("saveViewPreference failed", err);
  }
}
