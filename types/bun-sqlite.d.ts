declare module "bun:sqlite" {
  export type RunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export class Statement<TRow = any> {
    all(...params: any[]): TRow[];
    get(...params: any[]): TRow | null;
    run(...params: any[]): RunResult;
  }

  export class Database {
    constructor(
      filename?: string,
      options?: {
        create?: boolean;
        readonly?: boolean;
        strict?: boolean;
      },
    );

    query<TRow = any>(sql: string): Statement<TRow>;
    exec(sql: string): this;
    run(sql: string, ...params: any[]): RunResult;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
  }
}
