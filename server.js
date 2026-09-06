// 服务器入口：启动大富翁游戏服务
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createStore } from './src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'games.json');

const store = createStore(DATA_FILE);
const app = createApp({ store });

const server = app.listen(PORT, () => {
  console.log('======================================');
  console.log('  大富翁游戏服务器已启动');
  console.log(`  本地访问: http://localhost:${PORT}`);
  console.log('======================================');
});

// 优雅退出
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
