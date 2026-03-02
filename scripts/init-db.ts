import { countUsers, listTorrents } from "../lib/db";

const rows = listTorrents({ limit: 5 });
const users = countUsers();
console.log(`SQLite 初始化完成，当前已有 ${rows.length} 条种子数据，${users} 个用户。`);
