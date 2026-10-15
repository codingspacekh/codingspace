export type SecurityOptions = { supabaseUrl?: string; filesOrigin?: string };
export declare function buildCsp(options?: SecurityOptions): string;
export declare function securityHeaders(options?: SecurityOptions): { key: string; value: string }[];
