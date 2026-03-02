import { listTorrents } from "../lib/db";

const rows = listTorrents({ limit: 5 });
console.log(`SQLite 初始化完成，当前已有 ${rows.length} 条数据。`);
