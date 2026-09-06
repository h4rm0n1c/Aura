export interface D1MetaLike {
  readonly changes?: number;
}

export interface D1ResultLike<T = Record<string, unknown>> {
  readonly results?: readonly T[];
  readonly success?: boolean;
  readonly meta?: D1MetaLike;
}

export interface D1PreparedStatementLike {
  bind(...values: readonly unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: readonly D1PreparedStatementLike[]): Promise<readonly D1ResultLike[]>;
}

export function resultChanges(result: D1ResultLike | undefined): number {
  const changes = result?.meta?.changes;
  return Number.isSafeInteger(changes) && (changes as number) >= 0 ? (changes as number) : 0;
}
