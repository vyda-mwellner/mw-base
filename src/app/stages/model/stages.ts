/** Where the stages are read from, and what of it is missing. */
export interface StagesInfo {
  readonly workspaceDir: string;
  readonly workspaceFound: boolean;
  readonly gitopsFound: boolean;
  readonly kubeconfigDir: string;
  readonly kubeconfigEnvs: string[];
  /** Empty while there is no local-setup with a setup.sh. */
  readonly localSetupDir: string;
  /** Empty while greenmailUrl is not set. */
  readonly greenmailUrl: string;
  /** Empty while there is no vault with an INDEX.md. */
  readonly vaultDir: string;
  /** In German, one line per config file of the data folder that is missing or unreadable. */
  readonly configErrors: string[];
}
