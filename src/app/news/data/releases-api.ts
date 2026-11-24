import { Injectable } from '@angular/core';

import type { NpmVersion, Release } from '../domain/releases';

/** A failed request names the host, so the note says which of the sources is out of reach. */
async function read<T>(host: string, path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://${host}${path}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error(`${host} nicht erreichbar`);
  }
  if (!response.ok) throw new Error(`${host} antwortet mit ${response.status}`);
  return (await response.json()) as T;
}

/** Asked from the webview, as the weather is: both hosts allow any origin and are allowed in the CSP of `tauri.conf.json`. */
@Injectable({ providedIn: 'root' })
export class ReleasesApi {
  async releases(slug: string): Promise<Release[]> {
    const page = await read<{ result: { releases: Release[] } }>(
      'endoflife.date',
      `/api/v1/products/${slug}/`,
    );
    return page.result.releases;
  }

  async npmVersions(name: string): Promise<NpmVersion[]> {
    const page = await read<{ versions: NpmVersion[] }>(
      'api.deps.dev',
      `/v3/systems/npm/packages/${encodeURIComponent(name)}`,
    );
    return page.versions;
  }
}
