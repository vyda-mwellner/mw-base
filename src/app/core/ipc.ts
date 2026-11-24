import { invoke, isTauri, type InvokeArgs } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

/** Tauri rejects with the serialized Rust error, a plain string - resources expect an Error. */
export async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  if (!isTauri()) throw new Error('Nur im Desktop-Fenster verfügbar (npm run desktop)');
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/** Calls `handler` each time the shell emits `event`; outside the window none ever comes. */
export function onShellEvent(event: string, handler: () => void): void {
  if (isTauri()) void listen(event, handler);
}

export function errorMessage(error: unknown): string | null {
  if (error === undefined || error === null) return null;
  return error instanceof Error ? error.message : String(error);
}

/** macOS app names, each one allowed in `capabilities/default.json`. */
export type Browser = 'Google Chrome' | 'Firefox';

/** In that browser, or the default one without it: a link followed inside the webview would take the app window away. */
export async function openExternal(url: string, browser: Browser = 'Google Chrome'): Promise<void> {
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  try {
    await openUrl(url, browser);
  } catch {
    await openUrl(url);
  }
}
