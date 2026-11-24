/** up: answers fine, down: answers with an error or not at all, off: nothing listens on the port. */
export type Health = 'up' | 'down' | 'off';

export interface ServiceHealth {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly kind: 'frontend' | 'backend' | 'service' | 'infra';
  /** The folder of local-setup that runs it, null for what runs on its own like a dev server. */
  readonly stack: string | null;
  /** The probed URL, or tcp://host:port for a port check. */
  readonly target: string;
  readonly health: Health;
  readonly detail: string;
}
