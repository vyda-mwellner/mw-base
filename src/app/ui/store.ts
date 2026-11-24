import { computed, Injectable, signal } from '@angular/core';
import { invoke, isTauri } from '@tauri-apps/api/core';

import { errorText } from './task';

interface StoredDoc<T> {
  readonly name: string;
  readonly value: T;
}

const BROWSER_PREFIX = 'base:';

/**
 * JSON documents in the data folder, addressed by a path relative to it - `haus/rekorde.json`. In the desktop
 * shell they are files (`src-tauri/src/store.rs`); outside it (`npm start`, the specs) they live in localStorage,
 * so the UI can be worked on in a browser.
 */
@Injectable({ providedIn: 'root' })
export class Store {
  readonly desktop = isTauri();

  /** What failed to load. Never written over - the state behind it is a default, and saving it would lose the file. */
  private readonly unreadable = signal<ReadonlyMap<string, string>>(new Map());
  readonly loadErrors = computed(() => [...this.unreadable().values()]);

  read<T>(path: string): Promise<T | null> {
    return this.loading(path, async () => {
      const content = await this.content(path);
      return content === null ? null : (JSON.parse(content) as T);
    });
  }

  /** A file as it is, the `.svg` of a logo; the shell reads it but writes JSON alone. */
  readText(path: string): Promise<string | null> {
    return this.loading(path, () => this.content(path));
  }

  /** Every document directly in `dir`, sorted by file name. */
  readDir<T>(dir: string): Promise<StoredDoc<T>[]> {
    return this.loading(`${dir}/`, async () => {
      const docs = this.desktop
        ? await invoke<{ name: string; content: string }[]>('read_docs', { dir })
        : browserDocs(`${BROWSER_PREFIX}${dir}/`);
      return docs.map((doc) => ({ name: doc.name, value: JSON.parse(doc.content) as T }));
    });
  }

  async write(path: string, value: unknown): Promise<void> {
    const blocked = [...this.unreadable().keys()].find((key) => path === key || path.startsWith(key));
    if (blocked) throw new Error(`Nicht gespeichert: ${blocked} ließ sich nicht laden.`);
    const content = `${JSON.stringify(value, null, 2)}\n`;
    if (this.desktop) await invoke('write_doc', { path, content });
    else localStorage.setItem(BROWSER_PREFIX + path, content);
  }

  async remove(path: string): Promise<void> {
    if (this.desktop) await invoke('remove_doc', { path });
    else localStorage.removeItem(BROWSER_PREFIX + path);
  }

  private async content(path: string): Promise<string | null> {
    return this.desktop
      ? invoke<string | null>('read_doc', { path })
      : localStorage.getItem(BROWSER_PREFIX + path);
  }

  private async loading<T>(key: string, load: () => Promise<T>): Promise<T> {
    try {
      const value = await load();
      if (this.unreadable().has(key))
        this.unreadable.update((all) => new Map([...all].filter(([known]) => known !== key)));
      return value;
    } catch (error) {
      this.unreadable.update((all) => new Map(all).set(key, `${key}: ${errorText(error)}`));
      throw error;
    }
  }
}

function browserDocs(prefix: string): { name: string; content: string }[] {
  const docs: { name: string; content: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const name = key.slice(prefix.length);
    if (name.includes('/') || !name.endsWith('.json')) continue;
    docs.push({ name, content: localStorage.getItem(key) ?? 'null' });
  }
  return docs.sort((a, b) => a.name.localeCompare(b.name));
}
