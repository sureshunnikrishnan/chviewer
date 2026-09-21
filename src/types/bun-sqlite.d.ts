declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean; create?: boolean })
    exec(sql: string): void
    run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    query(sql: string): {
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
    transaction<T extends (...args: never[]) => unknown>(fn: T): T
    close(): void
  }
}
