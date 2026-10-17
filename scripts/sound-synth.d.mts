export declare const RATE: number;
export declare function random(seed: number): () => number;
export declare function osc(
  ms: number,
  f0: number,
  f1?: number,
  options?: { wave?: 'sine' | 'square' | 'saw' | 'tri'; vol?: number; attackMs?: number; decay?: number },
): Float32Array;
export declare function noise(
  ms: number,
  seed: number,
  options?: { from?: number; to?: number; vol?: number; attackMs?: number; decay?: number },
): Float32Array;
export declare const SOUNDS: Record<'hover' | 'transition' | 'click', () => Float32Array>;
export declare const ALTERNATIVES: Record<
  | 'click'
  | 'transition'
  | 'typing'
  | 'deploy'
  | 'start'
  | 'tap'
  | 'droplet'
  | 'glass'
  | 'key'
  | 'breeze'
  | 'swish'
  | 'hum',
  () => Float32Array
>;
export declare function wav(samples: Float32Array | number[]): Buffer;
