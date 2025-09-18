/**
 * Type definitions for browser APIs that are not fully typed in standard TypeScript
 */

// Performance Memory API
export interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface PerformanceExtended extends Performance {
  memory?: PerformanceMemory;
}

// Network Information API
export interface NetworkInformation extends EventTarget {
  type?: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number; // Mbps
  downlinkMax?: number; // Mbps
  rtt?: number; // ms
  saveData?: boolean;
}

export interface NavigatorExtended extends Navigator {
  connection?: NetworkInformation;
  getBattery?(): Promise<BatteryManager>;
}

// Battery API
export interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number; // 0 to 1
  addEventListener(type: 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange' | 'levelchange', listener: EventListener): void;
}

// HTML Link Element with fetchPriority
export interface HTMLLinkElementWithFetchPriority extends HTMLLinkElement {
  fetchPriority: 'high' | 'low' | 'auto';
}

// HTML Element with value property for form elements
export interface HTMLElementWithValue extends HTMLElement {
  value?: string;
}

// HTML Select Element with selectedIndex
export interface HTMLSelectElementWithIndex extends HTMLElement {
  selectedIndex?: number;
}

// Utility type guards
export function hasMemoryAPI(performance: Performance): performance is PerformanceExtended {
  return 'memory' in performance && performance.memory !== undefined;
}

export function hasConnectionAPI(navigator: Navigator): navigator is NavigatorExtended {
  return 'connection' in navigator && navigator.connection !== undefined;
}

export function hasBatteryAPI(navigator: Navigator): navigator is NavigatorExtended {
  return 'getBattery' in navigator && typeof navigator.getBattery === 'function';
}

export function hasFetchPrioritySupport(link: HTMLLinkElement): link is HTMLLinkElementWithFetchPriority {
  return 'fetchPriority' in link;
}

export function hasValueProperty(element: HTMLElement): element is HTMLElementWithValue {
  return 'value' in element;
}

export function hasSelectedIndexProperty(element: HTMLElement): element is HTMLSelectElementWithIndex {
  return 'selectedIndex' in element;
}