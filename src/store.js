// 游戏状态持久化存储
// 以 JSON 文件形式保存所有游戏，采用「临时文件 + 原子重命名」避免写入中断损坏数据

import fs from 'node:fs';
import path from 'node:path';

export function createStore(filePath) {
  let cache = null;

  function load() {
    if (cache !== null) return cache;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      cache = {}; // 文件不存在或损坏时从空状态开始
    }
    return cache;
  }

  function persist() {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, filePath);
  }

  return {
    get(id) {
      return load()[id] || null;
    },
    set(id, game) {
      load()[id] = game;
      persist();
    },
    remove(id) {
      if (id in load()) {
        delete load()[id];
        persist();
      }
    },
    list() {
      return Object.values(load());
    },
  };
}
