// 大富翁核心游戏引擎
// 独立封装为可复用模块，同时供浏览器前端、Node 后端与测试使用。
// 所有函数以「纯状态对象 + 注入随机源」的方式实现，便于单元测试。

import {
  BOARD,
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  COLOR_GROUPS,
  getCell,
  isPurchasable,
} from './board-data.js';
import { createId, rollDice, shuffle } from './utils.js';

// 游戏状态
export const GAME_STATUS = {
  LOBBY: 'lobby',     // 等待玩家加入
  PLAYING: 'playing', // 进行中
  OVER: 'over',       // 已结束
};

// 回合阶段
export const PHASE = {
  AWAITING_ROLL: 'awaiting_roll',     // 等待掷骰子
  AWAITING_ACTION: 'awaiting_action', // 等待决策（是否购买）
  TURN_END: 'turn_end',               // 回合结束（瞬态）
};

// 玩家颜色
export const PLAYER_COLORS = [
  '#e74c3c', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085',
];

// 默认配置
export const DEFAULT_CONFIG = {
  startingMoney: 1500,       // 初始资金
  passGoBonus: 200,          // 经过起点奖励
  bailCost: 50,              // 保释金
  maxTurns: 80,              // 最大玩家行动次数（防止无限拖延）
  overtimeMs: 18 * 60 * 1000, // 加时赛时长阈值（超过后进入加时赛）
  overtimeRounds: 5,         // 加时赛再进行的回合数，结束后按净资产判定胜负
};

const JAIL_INDEX = 10;  // 监狱格
const MAX_JAIL_TURNS = 3; // 最多尝试出狱次数
const MAX_DOUBLES = 3;    // 连续双骰上限

// ---------------------------------------------------------------------------
// 游戏创建与玩家管理
// ---------------------------------------------------------------------------

export function createGame(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return {
    id: createId('game'),
    status: GAME_STATUS.LOBBY,
    version: 0,          // 状态版本号，用于前端轮询增量更新
    lastActive: Date.now(),
    config: cfg,
    players: [],
    currentPlayerIndex: 0,
    board: BOARD.map((cell) => ({ ...cell, owner: null, mortgaged: false, houses: 0 })),
    dice: null,          // 最近一次掷骰结果 { die1, die2, total, isDouble }
    doublesCount: 0,     // 当前回合连续双骰次数
    canRollAgain: false, // 掷出双骰后是否可再掷
    phase: PHASE.AWAITING_ROLL,
    pendingProperty: null, // 待购买的地产索引
    turnNumber: 0,
    startedAt: null,        // 游戏开始时间（用于加时赛判定）
    overtime: false,        // 是否已进入加时赛
    overtimeStartRound: null, // 进入加时赛时的回合数基准
    winner: null,
    log: [],
    chanceDeck: shuffle(CHANCE_CARDS),
    communityDeck: shuffle(COMMUNITY_CARDS),
  };
}

export function addPlayer(game, { name, isAI = false } = {}) {
  if (game.status !== GAME_STATUS.LOBBY) {
    throw new Error('游戏已开始，无法加入新玩家');
  }
  const color = PLAYER_COLORS[game.players.length % PLAYER_COLORS.length];
  const player = {
    id: createId('player'),
    name: name || `玩家${game.players.length + 1}`,
    isAI: !!isAI,
    color,
    money: game.config.startingMoney,
    position: 0,
    inJail: false,
    jailTurns: 0,
    bankrupt: false,
    properties: [], // 所拥有的地产索引
  };
  game.players.push(player);
  game.version += 1;
  logEvent(game, `${player.name} 加入了游戏`);
  return player;
}

export function startGame(game) {
  if (game.status !== GAME_STATUS.LOBBY) {
    throw new Error('游戏已经开始');
  }
  if (game.players.length < 2) {
    throw new Error('至少需要 2 名玩家才能开始');
  }
  game.status = GAME_STATUS.PLAYING;
  game.currentPlayerIndex = 0;
  game.phase = PHASE.AWAITING_ROLL;
  game.turnNumber = 1;
  game.startedAt = Date.now();
  game.version += 1;
  logEvent(game, `游戏开始！轮到 ${getCurrentPlayer(game).name}`);
  return game;
}

export function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

export function getPlayer(game, playerId) {
  return game.players.find((p) => p.id === playerId) || null;
}

// ---------------------------------------------------------------------------
// 核心动作：掷骰子、购买、跳过、保释
// ---------------------------------------------------------------------------

export function roll(game, playerId, rng = Math.random) {
  const player = requireCurrentPlayer(game, playerId);
  if (game.phase !== PHASE.AWAITING_ROLL) {
    throw new Error('当前阶段不能掷骰子');
  }
  const dice = rollDice(rng);
  game.dice = dice;
  game.version += 1;

  if (player.inJail) {
    return handleJailRoll(game, player, dice);
  }

  game.doublesCount += 1;
  if (game.doublesCount >= MAX_DOUBLES) {
    sendToJail(game, player, '连续掷出三次双骰');
    game.doublesCount = 0;
    game.canRollAgain = false;
    game.pendingProperty = null;
    advanceTurn(game);
    return game;
  }

  movePlayer(game, player, dice.total);
  resolveLanding(game, player);
  finalizeAfterMove(game, player, dice, { allowRollAgain: true });
  return game;
}

export function buyProperty(game, playerId) {
  const player = requireCurrentPlayer(game, playerId);
  if (game.pendingProperty == null) {
    throw new Error('当前没有待购买的地产');
  }
  const cell = game.board[game.pendingProperty];
  if (cell.owner != null) {
    throw new Error('该地产已被购买');
  }
  if (player.money < cell.price) {
    throw new Error('资金不足，无法购买');
  }
  player.money -= cell.price;
  cell.owner = player.id;
  player.properties.push(cell.index);
  logEvent(game, `${player.name} 购买了 ${cell.name}（$${cell.price}）`);
  game.pendingProperty = null;
  game.version += 1;
  finalizeAfterAction(game, player);
  return game;
}

export function skipPurchase(game, playerId) {
  const player = requireCurrentPlayer(game, playerId);
  if (game.pendingProperty != null) {
    logEvent(game, `${player.name} 放弃购买 ${getCell(game.pendingProperty).name}`);
  }
  game.pendingProperty = null;
  game.version += 1;
  finalizeAfterAction(game, player);
  return game;
}

export function payBail(game, playerId) {
  const player = requireCurrentPlayer(game, playerId);
  if (!player.inJail) {
    throw new Error('玩家不在监狱中');
  }
  if (player.money < game.config.bailCost) {
    throw new Error('资金不足，无法保释');
  }
  player.money -= game.config.bailCost;
  releaseFromJail(game, player, '支付保释金');
  game.phase = PHASE.AWAITING_ROLL;
  game.version += 1;
  return game;
}

// ---------------------------------------------------------------------------
// 内部：移动、落点处理、卡牌、租金、破产
// ---------------------------------------------------------------------------

function handleJailRoll(game, player, dice) {
  if (dice.isDouble) {
    releaseFromJail(game, player, '掷出双骰');
    movePlayer(game, player, dice.total);
    resolveLanding(game, player);
    finalizeAfterMove(game, player, dice, { allowRollAgain: false });
    return game;
  }

  player.jailTurns += 1;
  logEvent(game, `${player.name} 掷出 ${dice.die1}+${dice.die2}，未能出狱（第 ${player.jailTurns} 次）`);

  if (player.jailTurns >= MAX_JAIL_TURNS) {
    if (player.money >= game.config.bailCost) {
      player.money -= game.config.bailCost;
      logEvent(game, `${player.name} 支付 $${game.config.bailCost} 强制保释`);
      releaseFromJail(game, player, '强制保释');
      movePlayer(game, player, dice.total);
      resolveLanding(game, player);
      finalizeAfterMove(game, player, dice, { allowRollAgain: false });
    } else {
      declareBankrupt(game, player, null, '无法支付保释金');
      if (game.status !== GAME_STATUS.OVER) advanceTurn(game);
    }
    return game;
  }

  // 留在监狱，回合结束
  game.canRollAgain = false;
  game.pendingProperty = null;
  advanceTurn(game);
  return game;
}

function finalizeAfterMove(game, player, dice, { allowRollAgain }) {
  const canRoll = allowRollAgain && dice.isDouble && !player.inJail;
  game.canRollAgain = canRoll;
  if (game.pendingProperty != null) {
    game.phase = PHASE.AWAITING_ACTION;
  } else if (canRoll) {
    game.phase = PHASE.AWAITING_ROLL;
    logEvent(game, `${player.name} 掷出双骰，可再掷一次`);
  } else {
    game.phase = PHASE.TURN_END;
    advanceTurn(game);
  }
}

// 购买/跳过决策之后的状态推进
function finalizeAfterAction(game, player) {
  if (game.canRollAgain && !player.inJail) {
    game.phase = PHASE.AWAITING_ROLL;
  } else {
    game.phase = PHASE.TURN_END;
    advanceTurn(game);
  }
}

function movePlayer(game, player, steps) {
  const oldPos = player.position;
  let newPos = (oldPos + steps) % 40;
  if (newPos < 0) newPos += 40;
  player.position = newPos;
  if (steps > 0 && newPos < oldPos) {
    player.money += game.config.passGoBonus;
    logEvent(game, `${player.name} 经过起点，领取 $${game.config.passGoBonus}`);
  }
  logEvent(game, `${player.name} 从 ${getCell(oldPos).name} 移动到 ${getCell(newPos).name}`);
}

function resolveLanding(game, player) {
  const cell = game.board[player.position];
  switch (cell.type) {
    case 'go':
    case 'jail':
    case 'free-parking':
      break; // 无事发生
    case 'go-to-jail':
      sendToJail(game, player, '走进「入狱」格');
      break;
    case 'tax':
      payTax(game, player, cell.amount);
      break;
    case 'chance':
      drawCard(game, player, 'chance');
      break;
    case 'community':
      drawCard(game, player, 'community');
      break;
    default:
      handlePropertyLanding(game, player, cell);
      break;
  }
}

function handlePropertyLanding(game, player, cell) {
  if (cell.owner == null) {
    if (player.money >= cell.price) {
      game.pendingProperty = cell.index;
      logEvent(game, `${player.name} 停留在 ${cell.name}（$${cell.price}），可购买`);
    } else {
      logEvent(game, `${player.name} 停留在 ${cell.name}，资金不足无法购买`);
    }
    return;
  }
  if (cell.owner === player.id) {
    return; // 自己的地产
  }
  const owner = getPlayer(game, cell.owner);
  if (!owner || owner.bankrupt) return;
  const rent = computeRent(game, cell, owner);
  payRent(game, player, owner, rent);
}

// 租金计算
export function computeRent(game, cell, owner) {
  if (cell.type === 'railroad') {
    const count = countOwnedOfType(game, owner, 'railroad');
    return cell.rent * Math.pow(2, count - 1); // 25/50/100/200
  }
  if (cell.type === 'utility') {
    const count = countOwnedOfType(game, owner, 'utility');
    const mult = count === 2 ? 10 : 4;
    const diceTotal = game.dice ? game.dice.total : 7;
    return diceTotal * mult;
  }
  // 街道：垄断租金翻倍，再按房屋数量加成（房屋数量无上限）
  if (hasMonopoly(game, owner, cell.group)) {
    return cell.rent * 2 * houseMultiplier(cell.houses || 0);
  }
  return cell.rent * houseMultiplier(cell.houses || 0);
}

// 房屋数量 → 租金倍率（无上限：前 4 栋按经典梯度，之后每栋 +25 倍）
export function houseMultiplier(h) {
  if (h <= 0) return 1;
  const table = [0, 5, 12, 25, 40]; // 1~4 栋
  if (h <= 4) return table[h];
  return 40 + (h - 4) * 25; // 第 5 栋起无上限增长
}

// 获取某颜色分组的建房单价
export function getHousePrice(group) {
  const g = COLOR_GROUPS[group];
  return (g && g.housePrice) || 50;
}

// 建房（无上限）：在玩家拥有的街道地产上新增一栋房子
export function buildHouse(game, playerId, cellIndex) {
  const player = requireCurrentPlayer(game, playerId);
  if (game.status !== GAME_STATUS.PLAYING) {
    throw new Error('游戏未在进行中');
  }
  const cell = game.board[cellIndex];
  if (!cell || cell.type !== 'street') {
    throw new Error('只能对街道地产建房');
  }
  if (cell.owner !== player.id) {
    throw new Error('必须拥有该地产才能建房');
  }
  const price = getHousePrice(cell.group);
  if (player.money < price) {
    throw new Error(`资金不足，建房需要 $${price}`);
  }
  player.money -= price;
  cell.houses += 1;
  logEvent(game, `${player.name} 在 ${cell.name} 建成第 ${cell.houses} 栋房子（-$${price}），后续租金提升`);
  game.version += 1;
  return game;
}

function countOwnedOfType(game, owner, type) {
  return game.board.filter((c) => c.owner === owner.id && c.type === type).length;
}

function groupCells(group) {
  return BOARD.filter((c) => c.type === 'street' && c.group === group);
}

export function hasMonopoly(game, owner, group) {
  const cells = groupCells(group);
  return cells.every((c) => game.board[c.index].owner === owner.id);
}

function payRent(game, player, owner, rent) {
  const paid = Math.min(player.money, rent);
  player.money -= paid;
  owner.money += paid;
  logEvent(game, `${player.name} 向 ${owner.name} 支付租金 $${paid}`);
  if (paid < rent) {
    declareBankrupt(game, player, owner, '无力支付租金');
  }
}

function payTax(game, player, amount) {
  const paid = Math.min(player.money, amount);
  player.money -= paid;
  logEvent(game, `${player.name} 缴纳税款 $${paid}`);
  if (paid < amount) {
    declareBankrupt(game, player, null, '无力缴纳税款');
  }
}

function drawCard(game, player, deckName) {
  const deck = deckName === 'chance' ? game.chanceDeck : game.communityDeck;
  if (deck.length === 0) {
    logEvent(game, `${player.name} 的${deckName === 'chance' ? '机会' : '社区福利'}牌堆已空`);
    return;
  }
  const card = deck.pop();
  logEvent(game, `${player.name} 抽到${deckName === 'chance' ? '机会' : '社区福利'}卡：${card.text}`);
  applyCardEffect(game, player, card.effect);
}

function applyCardEffect(game, player, effect) {
  switch (effect.type) {
    case 'money': {
      player.money += effect.amount;
      logEvent(game, `${player.name} ${effect.amount >= 0 ? '获得' : '支付'} $${Math.abs(effect.amount)}`);
      if (player.money < 0) declareBankrupt(game, player, null, '无力支付卡牌费用');
      break;
    }
    case 'move': {
      const verb = effect.steps >= 0 ? '前进' : '后退';
      movePlayer(game, player, effect.steps);
      logEvent(game, `${player.name} ${verb} ${Math.abs(effect.steps)} 格至 ${getCell(player.position).name}`);
      resolveLanding(game, player); // 递归处理新落点
      break;
    }
    case 'goto': {
      player.position = effect.index;
      if (effect.collect) {
        player.money += game.config.passGoBonus;
        logEvent(game, `${player.name} 前进到起点，领取 $${game.config.passGoBonus}`);
      }
      break;
    }
    case 'jail': {
      sendToJail(game, player, '卡牌效果');
      break;
    }
    case 'collect-each': {
      const others = game.players.filter((p) => p.id !== player.id && !p.bankrupt);
      let total = 0;
      for (const o of others) {
        const pay = Math.min(o.money, effect.amount);
        o.money -= pay;
        player.money += pay;
        total += pay;
      }
      logEvent(game, `${player.name} 从其他玩家处收取 $${total}`);
      break;
    }
    default:
      break;
  }
}

function sendToJail(game, player, reason) {
  player.position = JAIL_INDEX;
  player.inJail = true;
  player.jailTurns = 0;
  logEvent(game, `${player.name} ${reason}，进入监狱`);
}

function releaseFromJail(game, player, reason) {
  player.inJail = false;
  player.jailTurns = 0;
  logEvent(game, `${player.name} ${reason}，离开监狱`);
}

export function declareBankrupt(game, player, creditor, reason = '破产') {
  if (player.bankrupt) return;
  player.bankrupt = true;
  player.inJail = false;

  const props = player.properties.slice();
  player.properties = [];
  const target = creditor && !creditor.bankrupt ? creditor : null;
  for (const idx of props) {
    const cell = game.board[idx];
    cell.owner = target ? target.id : null;
    if (target) target.properties.push(idx);
  }
  if (target) {
    target.money += Math.max(0, player.money);
  }
  player.money = 0;

  logEvent(
    game,
    `${player.name} 破产${reason ? `（${reason}）` : ''}${target ? `，资产移交 ${target.name}` : '，资产归还银行'}`,
  );
  game.version += 1;
  checkGameOver(game);
}

// ---------------------------------------------------------------------------
// 回合推进与游戏结束
// ---------------------------------------------------------------------------

export function netWorth(game, player) {
  return player.properties.reduce((sum, idx) => {
    const cell = game.board[idx];
    const houseVal = cell.type === 'street' ? (cell.houses || 0) * getHousePrice(cell.group) : 0;
    return sum + (cell.price || 0) + houseVal;
  }, player.money);
}

function advanceTurn(game) {
  if (game.status === GAME_STATUS.OVER) return;
  if (checkGameOver(game)) return;

  game.doublesCount = 0;
  game.canRollAgain = false;
  game.pendingProperty = null;

  do {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  } while (game.players[game.currentPlayerIndex].bankrupt);

  game.turnNumber += 1;
  game.phase = PHASE.AWAITING_ROLL;
  logEvent(game, `—— 轮到 ${getCurrentPlayer(game).name} ——`);

  // 常规结束：达到最大行动次数
  if (game.turnNumber > game.config.maxTurns) {
    finishGameByNetWorth(game, '达到最大行动次数');
    return;
  }

  // 加时赛判定：超过时长后再进行若干回合即按净资产结束
  checkOvertime(game);
}

// 活跃玩家数（未破产）
function activePlayersCount(game) {
  return game.players.filter((p) => !p.bankrupt).length;
}

// 已进行的完整回合数（一个回合 = 所有活跃玩家各行动一次）
function roundsElapsed(game) {
  const n = activePlayersCount(game);
  return n > 0 ? Math.floor((game.turnNumber - 1) / n) : 0;
}

// 加时赛判定与结束
function checkOvertime(game) {
  if (game.status === GAME_STATUS.OVER) return;

  if (!game.overtime) {
    if (game.startedAt && Date.now() - game.startedAt > game.config.overtimeMs) {
      game.overtime = true;
      game.overtimeStartRound = roundsElapsed(game);
      logEvent(game, `游戏时长已超过 ${Math.round(game.config.overtimeMs / 60000)} 分钟，进入加时赛！`);
    }
  }

  if (
    game.overtime &&
    roundsElapsed(game) - game.overtimeStartRound >= game.config.overtimeRounds
  ) {
    finishGameByNetWorth(game, '加时赛结束，按净资产判定');
  }
}

export function checkGameOver(game) {
  if (game.status === GAME_STATUS.OVER) return true;
  const alive = game.players.filter((p) => !p.bankrupt);
  if (alive.length <= 1) {
    game.status = GAME_STATUS.OVER;
    game.winner = alive.length === 1 ? alive[0].id : null;
    game.phase = PHASE.TURN_END;
    logEvent(game, alive.length === 1 ? `${alive[0].name} 获胜！` : '平局！');
    game.version += 1;
    return true;
  }
  return false;
}

function finishGameByNetWorth(game, reason = '达到最大行动次数') {
  const alive = game.players.filter((p) => !p.bankrupt);
  const sorted = alive.slice().sort((a, b) => netWorth(game, b) - netWorth(game, a));
  game.status = GAME_STATUS.OVER;
  game.winner = sorted[0].id;
  game.phase = PHASE.TURN_END;
  logEvent(game, `${reason}，${sorted[0].name} 以最高净资产获胜！`);
  game.version += 1;
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function requireCurrentPlayer(game, playerId) {
  const player = getCurrentPlayer(game);
  if (!player || player.id !== playerId) {
    throw new Error('不是当前玩家的回合');
  }
  if (player.bankrupt) {
    throw new Error('玩家已破产');
  }
  return player;
}

function logEvent(game, message) {
  game.log.push({ message, ts: Date.now(), turn: game.turnNumber });
  if (game.log.length > 300) {
    game.log = game.log.slice(-300);
  }
}

// 供前端与后端判断是否需要 AI 自动行动
export function currentPlayerIsAI(game) {
  const p = getCurrentPlayer(game);
  return !!(p && p.isAI && !p.bankrupt && game.status === GAME_STATUS.PLAYING);
}

// 判断某格是否为可购买地产（复用 board-data）
export { isPurchasable };
