export type ApiMode = 'http' | 'mock';

export const config = {
  appName: 'NovaWorks PM',
  companyName: 'NovaWorks Technologies',
  apiMode: (import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http') as ApiMode,
  /** Backend origin without a trailing slash. Empty means same origin (Vite proxy in development). */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
  showDemoAccounts: import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== 'false',
} as const;
