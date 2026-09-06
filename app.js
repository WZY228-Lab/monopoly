// 后端 Express 应用
// 提供 REST API 与静态文件服务，负责游戏状态管理、多玩家同步与持久化

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from './src/game-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// AI 自动行动：当前玩家为 AI 时，自动掷骰/购买/保释，直到轮到真人玩家
export function autoPlayAI(game) {
  let guard = 0;
  while (engine.currentPlayerIsAI(game) && guard++ < 1000) {
    const ai = engine.getCurrentPlayer(game);
    try {
      if (game.phase === engine.PHASE.AWAITING_ACTION && game.pendingProperty != null) {
        const cell = game.board[game.pendingProperty];
        if (ai.money >= cell.price) {
          engine.buyProperty(game, ai.id);
        } else {
          engine.skipPurchase(game, ai.id);
        }
      } else if (game.phase === engine.PHASE.AWAITING_ROLL) {
        if (ai.inJail && ai.money >= game.config.bailCost) {
          engine.payBail(game, ai.id);
        } else {
          engine.roll(game, ai.id);
        }
      } else {
        break; // 安全兜底，防止死循环
      }
    } catch (err) {
      // AI 动作失败时记录并停止，避免死循环
      game.log.push({ message: `[AI 异常] ${err.message}`, ts: Date.now(), turn: game.turnNumber });
      break;
    }
  }
}

export function createApp({ store }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 静态文件：前端页面与模块
  app.use(express.static(__dirname));
  app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  // 创建新游戏
  app.post('/api/game', (req, res) => {
    const config = (req.body && req.body.config) || {};
    const game = engine.createGame(config);
    store.set(game.id, game);
    res.status(201).json(game);
  });

  // 加入游戏（真人或 AI）
  app.post('/api/game/:id/join', (req, res) => {
    const game = store.get(req.params.id);
    if (!game) return res.status(404).json({ error: '游戏不存在' });
    try {
      const { name, isAI } = req.body || {};
      const player = engine.addPlayer(game, { name, isAI });
      game.lastActive = Date.now();
      store.set(game.id, game);
      res.json({ game, player });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 开始游戏
  app.post('/api/game/:id/start', (req, res) => {
    const game = store.get(req.params.id);
    if (!game) return res.status(404).json({ error: '游戏不存在' });
    try {
      engine.startGame(game);
      autoPlayAI(game);
      game.lastActive = Date.now();
      store.set(game.id, game);
      res.json(game);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 查询游戏状态（支持版本号增量：?v=N，无变化返回 304）
  app.get('/api/game/:id', (req, res) => {
    const game = store.get(req.params.id);
    if (!game) return res.status(404).json({ error: '游戏不存在' });
    const clientVersion = Number(req.query.v) || 0;
    if (clientVersion >= game.version) {
      return res.status(304).end();
    }
    res.json(game);
  });

  // 通用动作处理：掷骰/购买/跳过/保释
  function action(path, fn) {
    app.post(path, (req, res) => {
      const game = store.get(req.params.id);
      if (!game) return res.status(404).json({ error: '游戏不存在' });
      try {
        fn(game, req.body || {});
        autoPlayAI(game);
        game.lastActive = Date.now();
        store.set(game.id, game);
        res.json(game);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });
  }

  action('/api/game/:id/roll', (game, body) => engine.roll(game, body.playerId));
  action('/api/game/:id/buy', (game, body) => engine.buyProperty(game, body.playerId));
  action('/api/game/:id/skip', (game, body) => engine.skipPurchase(game, body.playerId));
  action('/api/game/:id/bail', (game, body) => engine.payBail(game, body.playerId));
  action('/api/game/:id/build', (game, body) => engine.buildHouse(game, body.playerId, body.cellIndex));

  return app;
}
