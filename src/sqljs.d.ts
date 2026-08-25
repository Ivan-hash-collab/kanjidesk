declare module 'sql.js' {
  type SqlValue = string | number | null | Uint8Array
  type QueryExecResult = { columns: string[]; values: SqlValue[][] }
  class Database {
    constructor(data?: ArrayLike<number> | Buffer)
    exec(sql: string): QueryExecResult[]
    close(): void
  }
  export default function initSqlJs(opts?: { locateFile?: (file: string) => string }): Promise<{
    Database: typeof Database
  }>
}

declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string
  export default url
}
