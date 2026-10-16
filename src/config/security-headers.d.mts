export type SecurityOptions = { supabaseUrl?: string; uploadOrigin?: string | null };
export declare function buildCsp(options?: SecurityOptions): string;
export declare function securityHeaders(
  options?: SecurityOptions & { indexable?: boolean },
): { key: string; value: string }[];
