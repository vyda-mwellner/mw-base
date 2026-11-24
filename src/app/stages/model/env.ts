export type Env = 'dev' | 'test' | 'prod';

export const ENVS: readonly Env[] = ['dev', 'test', 'prod'];

export const ENV_LABELS: Readonly<Record<Env, string>> = { dev: 'DEV', test: 'TEST', prod: 'PROD' };
