// 通用工具函数

// 生成随机 ID
export function createId(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

// 掷单个骰子（1-6），rng 可注入以便测试
export function rollDie(rng = Math.random) {
  return Math.floor(rng() * 6) + 1;
}

// 掷两颗骰子
export function rollDice(rng = Math.random) {
  const die1 = rollDie(rng);
  const die2 = rollDie(rng);
  return { die1, die2, total: die1 + die2, isDouble: die1 === die2 };
}

// Fisher-Yates 洗牌
export function shuffle(arr, rng = Math.random) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 从数组中随机取一项
export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

// 格式化金钱显示
export function formatMoney(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`;
}

// 深拷贝（结构化克隆，支持普通对象/数组）
export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
