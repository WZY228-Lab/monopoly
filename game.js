// 3D 大富翁 · CYBER MONOPOLY —— 支持【单机】与【联机（房间号回合制）】
// - 单机：直接在浏览器运行引擎（src/game-engine.js），真人轮换 + AI。
// - 联机：对接后端 API（建房/房间号/加入/回合同步/持久化/AI），多设备同玩一盘。
// 两模式共用同一套棋盘 / 玩家面板 / 操作区渲染。

import * as engine from './src/game-engine.js';
import { BOARD } from './src/board-data.js';
import { formatMoney } from './src/utils.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const PLAYER_NAMES = ['红方', '蓝方', '绿方', '黄方', '紫方', '青方'];

const BG = {
  go: 'linear-gradient(135deg,#12c2e9,#0c7488)',
  'free-parking': 'linear-gradient(135deg,#56ab2f,#0f7a4d)',
  'go-to-jail': 'linear-gradient(135deg,#7b4397,#b52fb0)',
  jail: 'linear-gradient(135deg,#3a3a5c,#23233a)',
  chance: 'linear-gradient(135deg,#8e2de2,#4a00e0)',
  community: 'linear-gradient(135deg,#f7971e,#e6b800)',
  tax: 'linear-gradient(135deg,#ff512f,#c82f6b)',
  railroad: 'linear-gradient(135deg,#7f8c8d,#5b6a6b)',
  utility: 'linear-gradient(135deg,#f7b733,#e89a1f)',
  brown: 'linear-gradient(135deg,#a37462,#7c4c28)',
  'light-blue': 'linear-gradient(135deg,#4facfe,#00a6c4)',
  pink: 'linear-gradient(135deg,#f857a6,#e04a86)',
  orange: 'linear-gradient(135deg,#f2994a,#d97a1f)',
  red: 'linear-gradient(135deg,#ee3b6b,#c22a52)',
  yellow: 'linear-gradient(135deg,#f7c531,#e0a51f)',
  green: 'linear-gradient(135deg,#2fbf71,#1e9e56)',
  'dark-blue': 'linear-gradient(135deg,#485563,#2c3e50)',
};

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 状态 ----
let game = null;
let mode = 'local';                 // 'local' | 'online'
let setup = { count: 2, playerTypes: [] };
let buildMode = false;
let controlsLocked = false;
let rolling = false;
let rollAnimTimer = null;
let myPlayerId = null;
let online = { roomId: null, lastVersion: 0 };
let pollTimer = null;
let die1 = null, die2 = null, currentLabel = null;
let cellEls = [];

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = amt > 0 ? 255 : 0;
  const t = Math.abs(amt);
  const mix = (c) => Math.round(c + (target - c) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
function setDie(el, value) {
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip';
    if (PIPS[value] && PIPS[value].includes(i)) pip.classList.add('on');
    el.appendChild(pip);
  }
}
function setDice(d1, d2) { setDie(die1, d1); setDie(die2, d2); }
function startRollAnim() {
  if (!die1 || !die2) return;
  die1.classList.add('rolling');
  die2.classList.add('rolling');
  rollAnimTimer = setInterval(() => {
    setDie(die1, Math.floor(Math.random() * 6) + 1);
    setDie(die2, Math.floor(Math.random() * 6) + 1);
  }, 90);
}
function stopRollAnim() {
  clearInterval(rollAnimTimer);
  rollAnimTimer = null;
  if (die1) die1.classList.remove('rolling');
  if (die2) die2.classList.remove('rolling');
}
function bgFor(c) {
  if (c.group) return BG[c.group] || BG.brown;
  return BG[c.type] || '#2a1a0c';
}
function totalHouses(p) {
  return game.board.reduce((s, c) => (c.owner === p.id && c.type === 'street' ? s + (c.houses || 0) : s), 0);
}
function isMyTurn() {
  if (!game || game.status !== 'playing') return false;
  const cur = engine.getCurrentPlayer(game);
  if (!cur || cur.isAI || cur.bankrupt) return false;
  if (mode === 'online') return cur.id === myPlayerId;
  return true;
}
function currentPlayerId() {
  return game ? engine.getCurrentPlayer(game).id : null;
}

// ---------------------------------------------------------------------------
// 棋盘
// ---------------------------------------------------------------------------
function cellCoord(index) {
  if (index === 0) return { row: 11, col: 11 };
  if (index <= 9) return { row: 11, col: 11 - index };
  if (index === 10) return { row: 11, col: 1 };
  if (index <= 19) return { row: 21 - index, col: 1 };
  if (index === 20) return { row: 1, col: 1 };
  if (index <= 29) return { row: 1, col: index - 19 };
  if (index === 30) return { row: 1, col: 11 };
  if (index <= 39) return { row: index - 29, col: 11 };
  throw new Error('非法棋盘索引');
}

function initBoard() {
  const boardEl = $('#board');
  boardEl.innerHTML = '';
  cellEls = [];

  const center = document.createElement('div');
  center.className = 'board-center';
  center.innerHTML = `
    <div class="logo">3D 大富翁</div>
    <div class="dice-row"><div id="die1" class="die"></div><div id="die2" class="die"></div></div>
    <div class="current-label" id="current-label"></div>`;
  boardEl.appendChild(center);
  die1 = center.querySelector('#die1');
  die2 = center.querySelector('#die2');
  currentLabel = center.querySelector('#current-label');

  for (const cellDef of BOARD) {
    const el = document.createElement('div');
    const { row, col } = cellCoord(cellDef.index);
    el.style.gridRow = String(row);
    el.style.gridColumn = String(col);
    el.className = 'cell';
    el.dataset.index = cellDef.index;
    el.style.background = bgFor(cellDef);
    if (cellDef.index === 0) el.classList.add('go');
    if (cellDef.index === 10 || cellDef.index === 20 || cellDef.index === 30) el.classList.add('corner');
    const price = cellDef.price ? `<div class="cell-price">$${cellDef.price}</div>` : '';
    el.innerHTML = `
      <span class="owner-strip"></span>
      <div class="building"></div>
      <div class="cell-name">${cellDef.short || cellDef.name}</div>
      ${price}
      <div class="tokens"></div>`;
    el.addEventListener('click', () => onCellClick(cellDef.index));
    boardEl.appendChild(el);
    cellEls[cellDef.index] = el;
  }
}

function renderBoard() {
  if (!game) return;
  const cur = engine.getCurrentPlayer(game);
  const buildSet = new Set();
  if (buildMode && cur && !cur.isAI && !cur.bankrupt) {
    for (const c of game.board) if (c.type === 'street' && c.owner === cur.id) buildSet.add(c.index);
  }
  for (const cell of game.board) {
    const el = cellEls[cell.index];
    const owner = cell.owner ? game.players.find((p) => p.id === cell.owner) : null;
    el.querySelector('.owner-strip').style.setProperty('--owner', owner ? owner.color : 'transparent');
    el.classList.toggle('purchaseable', game.pendingProperty === cell.index && !buildMode);
    el.classList.toggle('buildable', buildMode && buildSet.has(cell.index));
    renderBuilding(el, owner, cell);
    const tokens = el.querySelector('.tokens');
    tokens.innerHTML = '';
    for (const p of game.players) {
      if (p.position === cell.index && !p.bankrupt) {
        const t = document.createElement('span');
        t.className = 'token';
        if (cur && p.id === cur.id) t.classList.add('current');
        t.style.background = p.color;
        tokens.appendChild(t);
      }
    }
  }
}

function renderBuilding(el, owner, cell) {
  const bld = el.querySelector('.building');
  if (!owner) { bld.innerHTML = ''; return; }
  let html = '';
  if (cell.type === 'street') {
    const houses = cell.houses || 0;
    const n = Math.max(1, Math.min(houses, 4));
    for (let i = 0; i < n; i++) html += cubeHTML(owner.color, 9);
    if (houses > 0) html += `<span class="house-count">${houses}</span>`;
  } else {
    html = cubeHTML(owner.color, 11);
  }
  bld.innerHTML = html;
}
function cubeHTML(color, size) {
  return `<div class="hc" style="--s:${size}px;--c-light:${shade(color, 0.45)};--c:${color};--c-dark:${shade(color, -0.38)}">
    <i class="b-top"></i><i class="b-right"></i><i class="b-left"></i>
  </div>`;
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------
function renderPlayers() {
  const list = $('#player-list');
  list.innerHTML = '';
  if (!game) return;
  const cur = engine.getCurrentPlayer(game);
  for (const p of game.players) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.style.setProperty('--pc', p.color);
    if (cur && p.id === cur.id) card.classList.add('current');
    if (p.bankrupt) card.classList.add('bankrupt');
    const status = p.bankrupt ? '💀 破产' : p.inJail ? '🔒 监狱' : `📍 第${p.position}格`;
    const you = (mode === 'online' && p.id === myPlayerId) ? '（我）' : '';
    card.innerHTML = `
      <span class="dot" style="background:${p.color}"></span>
      <div class="info">
        <div class="name">${escapeHtml(p.name)}${you}</div>
        <div class="money">💰 ${formatMoney(p.money)}</div>
        <div class="status">${status} · 🏠 ${totalHouses(p)}</div>
      </div>
      <span class="tag ${p.isAI ? 'ai' : ''}">${p.isAI ? '🤖 AI' : '🙂 真人'}</span>`;
    list.appendChild(card);
  }
}

function renderCenter() {
  if (!currentLabel) return;
  if (!game || game.status !== 'playing') { currentLabel.innerHTML = ''; return; }
  const cur = engine.getCurrentPlayer(game);
  const you = (mode === 'online' && cur.id === myPlayerId) ? '（我）' : '';
  currentLabel.innerHTML = `当前：<b>${escapeHtml(cur.name)}</b>${you}${cur.isAI ? ' 🤖' : ''}`;
}

function renderControls() {
  const cur = game && game.status === 'playing' ? engine.getCurrentPlayer(game) : null;
  const mine = isMyTurn();
  const locked = controlsLocked || rolling || !mine;
  const awaitingRoll = game && game.phase === engine.PHASE.AWAITING_ROLL;
  const awaitingAction = game && game.phase === engine.PHASE.AWAITING_ACTION;
  const hasPending = game && game.pendingProperty != null;

  const roll = $('#btn-roll');
  const buy = $('#btn-buy');
  const skip = $('#btn-skip');
  const bail = $('#btn-bail');
  const build = $('#btn-build');

  roll.hidden = false;
  roll.disabled = locked || !awaitingRoll;
  buy.hidden = !(awaitingAction && hasPending);
  buy.disabled = locked;
  skip.hidden = !(awaitingAction && hasPending);
  skip.disabled = locked;
  bail.hidden = !(cur && cur.inJail && awaitingRoll);
  bail.disabled = locked;

  const hasStreets = game ? game.board.some((c) => c.type === 'street' && c.owner === (cur && cur.id)) : false;
  build.disabled = locked || !hasStreets;

  $('#build-hint').hidden = !buildMode;
  $('#turn-indicator').textContent = game && game.status === 'playing'
    ? (rolling ? '🎲 掷骰中…' : (controlsLocked ? '🤖 AI 行动中…' : `轮到 ${cur.name}`))
    : (game && game.status === 'over' ? '🏁 游戏结束' : '—');
}

function renderLog() {
  const log = $('#log');
  log.innerHTML = '';
  const logs = (game && game.log) || [];
  for (const entry of logs.slice(-60)) {
    const div = document.createElement('div');
    div.textContent = entry.message;
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

function renderGameOver() {
  const modal = $('#modal');
  if (game && game.status === 'over') {
    const w = game.players.find((p) => p.id === game.winner);
    $('#modal-title').textContent = '🏆 游戏结束';
    $('#modal-body').textContent = w ? `${w.name} 赢得这场对决！` : '平局！';
    modal.hidden = false;
  } else {
    modal.hidden = true;
  }
}

function renderDice() {
  if (game && game.dice) setDice(game.dice.die1, game.dice.die2);
}

function renderAll() {
  renderBoard();
  renderPlayers();
  renderCenter();
  renderControls();
  renderDice();
  renderLog();
  renderGameOver();
}

// ---------------------------------------------------------------------------
// 设置屏：模式切换 + 单机设置
// ---------------------------------------------------------------------------
function switchMode(m) {
  mode = m;
  $('#tab-local').classList.toggle('active', m === 'local');
  $('#tab-online').classList.toggle('active', m === 'online');
  $('#local-pane').hidden = m !== 'local';
  $('#online-pane').hidden = m !== 'online';
  if (m === 'local') buildLocalSetup();
}

function buildLocalSetup() {
  const cnt = $('#count-btns');
  cnt.innerHTML = '';
  for (let n = 2; n <= 6; n++) {
    const b = document.createElement('button');
    b.textContent = `${n}人`;
    if (n === setup.count) b.classList.add('active');
    b.addEventListener('click', () => { setup.count = n; buildLocalSetup(); });
    cnt.appendChild(b);
  }
  if (setup.playerTypes.length !== setup.count) setup.playerTypes = Array.from({ length: setup.count }, () => false);
  const rows = $('#player-rows');
  rows.innerHTML = '';
  for (let i = 0; i < setup.count; i++) {
    const color = engine.PLAYER_COLORS[i];
    const row = document.createElement('div');
    row.className = 'player-row';
    row.style.setProperty('--pc', color);
    const isAI = setup.playerTypes[i];
    row.innerHTML = `
      <span class="dot" style="background:${color}"></span>
      <input type="text" value="${PLAYER_NAMES[i]}" maxlength="8" />
      <button class="toggle ${isAI ? 'ai' : 'human'}" data-i="${i}">${isAI ? '电脑AI' : '真人'}</button>`;
    rows.appendChild(row);
  }
  rows.querySelectorAll('.toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      setup.playerTypes[i] = !setup.playerTypes[i];
      buildLocalSetup();
    });
  });
}

// ---------------------------------------------------------------------------
// 联机：创建 / 加入 / 大厅 / 轮询
// ---------------------------------------------------------------------------
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    let err = `请求失败(${res.status})`;
    try { const e = await res.json(); if (e.error) err = e.error; } catch { /* ignore */ }
    throw new Error(err);
  }
  return res.json();
}

async function createRoom() {
  const name = $('#host-name').value.trim() || '房主';
  try {
    const g = await postJSON('/api/game', {});
    const joined = await postJSON(`/api/game/${g.id}/join`, { name });
    online.roomId = g.id;
    myPlayerId = joined.player.id;
    switchMode('online');
    startPolling();
    applyState(joined.game);
  } catch (e) { alert(e.message); }
}

async function joinRoom() {
  const code = $('#room-code').value.trim();
  const name = $('#join-name').value.trim() || '玩家';
  if (!code) { alert('请输入房间号'); return; }
  try {
    const joined = await postJSON(`/api/game/${code}/join`, { name });
    online.roomId = code;
    myPlayerId = joined.player.id;
    switchMode('online');
    startPolling();
    applyState(joined.game);
  } catch (e) { alert(e.message); }
}

function renderOnlineLobby(g) {
  $('#online-forms').hidden = true;
  $('#online-lobby').hidden = false;
  $('#room-code-display').textContent = g.id;
  const isHost = g.players[0] && g.players[0].id === myPlayerId;
  const list = $('#room-players');
  list.innerHTML = '';
  for (const p of g.players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.style.setProperty('--pc', p.color);
    row.innerHTML = `<span class="dot" style="background:${p.color}"></span>
      <span class="lobby-name">${escapeHtml(p.name)} ${p.isAI ? '🤖' : p.id === myPlayerId ? '（我）' : ''}</span>`;
    list.appendChild(row);
  }
  $('#btn-room-ai').disabled = !isHost || g.players.length >= 6;
  $('#btn-room-start').disabled = !isHost || g.players.length < 2;
}

async function startOnline() {
  try { applyState(await postJSON(`/api/game/${online.roomId}/start`)); } catch (e) { alert(e.message); }
}

async function addAIOnline() {
  const n = (game && game.players.length) + 1;
  try {
    const j = await postJSON(`/api/game/${online.roomId}/join`, { name: `AI-${n}`, isAI: true });
    applyState(j.game);
  } catch (e) { alert(e.message); }
}

function leaveRoom() {
  stopPolling();
  online.roomId = null;
  myPlayerId = null;
  online.lastVersion = 0;
  game = null;
  $('#online-lobby').hidden = true;
  $('#online-forms').hidden = false;
  switchMode('online');
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollOnline, 700);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

async function pollOnline() {
  if (!online.roomId) return;
  try {
    const res = await fetch(`/api/game/${online.roomId}?v=${online.lastVersion}`);
    if (res.status === 304) return;
    if (res.status === 404) { leaveRoom(); return; }
    if (!res.ok) return;
    applyState(await res.json());
  } catch { /* ignore */ }
}

// 通用状态应用：大厅显示大厅，游戏中显示棋盘
function applyState(g) {
  game = g;
  online.lastVersion = g.version;
  if (g.status === 'lobby') {
    showSetup();
    if (mode === 'online') renderOnlineLobby(g);
  } else {
    showGame();
    renderAll();
  }
}

// ---------------------------------------------------------------------------
// 开始 / 离开 / 重启
// ---------------------------------------------------------------------------
function showGame() {
  $('#setup').hidden = true;
  $('#game').hidden = false;
  renderAll();
}
function showSetup() {
  $('#setup').hidden = false;
  $('#game').hidden = true;
  $('#modal').hidden = true;
}

function startLocal() {
  game = engine.createGame();
  const rows = document.querySelectorAll('#local-pane .player-row');
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].querySelector('input').value.trim() || PLAYER_NAMES[i];
    engine.addPlayer(game, { name, isAI: setup.playerTypes[i] });
  }
  engine.startGame(game);
  buildMode = false;
  controlsLocked = false;
  stopRollAnim();
  showGame();
  maybeAutoPlayAI();
}

function restart() {
  game = null;
  buildMode = false;
  controlsLocked = false;
  rolling = false;
  stopRollAnim();
  stopPolling();
  online.roomId = null;
  myPlayerId = null;
  online.lastVersion = 0;
  $('#modal').hidden = true;
  if (mode === 'online') {
    $('#online-lobby').hidden = true;
    $('#online-forms').hidden = false;
    showSetup();
  } else {
    showSetup();
    buildLocalSetup();
  }
}

// ---------------------------------------------------------------------------
// 动作（按模式分支）
// ---------------------------------------------------------------------------
async function doRoll() {
  if (mode === 'online') return doRollOnline();
  return doRollLocal();
}

async function doRollOnline() {
  if (controlsLocked || rolling || !isMyTurn()) return;
  rolling = true; controlsLocked = true; renderControls();
  startRollAnim();
  try {
    const [g] = await Promise.all([
      postJSON(`/api/game/${online.roomId}/roll`, { playerId: myPlayerId }),
      sleep(900),
    ]);
    stopRollAnim(); rolling = false; controlsLocked = false;
    applyState(g);
  } catch (e) {
    stopRollAnim(); rolling = false; controlsLocked = false;
    alert(e.message); renderControls();
  }
}

async function doRollLocal() {
  if (controlsLocked || rolling) return;
  const cur = engine.getCurrentPlayer(game);
  if (!cur || cur.isAI) return;
  rolling = true; controlsLocked = true; renderControls();
  startRollAnim();
  await sleep(900);
  stopRollAnim();
  if (!game) { rolling = false; controlsLocked = false; return; }
  try {
    engine.roll(game, cur.id);
    if (game.dice) setDice(game.dice.die1, game.dice.die2);
  } catch (e) { alert(e.message); }
  buildMode = false; rolling = false; controlsLocked = false;
  renderAll();
  maybeAutoPlayAI();
}

async function doBuy() {
  if (mode === 'online') {
    try { applyState(await postJSON(`/api/game/${online.roomId}/buy`, { playerId: myPlayerId })); }
    catch (e) { alert(e.message); }
    return;
  }
  const cur = engine.getCurrentPlayer(game);
  try { engine.buyProperty(game, cur.id); } catch (e) { alert(e.message); }
  renderAll();
  maybeAutoPlayAI();
}
async function doSkip() {
  if (mode === 'online') {
    try { applyState(await postJSON(`/api/game/${online.roomId}/skip`, { playerId: myPlayerId })); }
    catch (e) { alert(e.message); }
    return;
  }
  const cur = engine.getCurrentPlayer(game);
  try { engine.skipPurchase(game, cur.id); } catch (e) { alert(e.message); }
  renderAll();
  maybeAutoPlayAI();
}
async function doBail() {
  if (mode === 'online') {
    try { applyState(await postJSON(`/api/game/${online.roomId}/bail`, { playerId: myPlayerId })); }
    catch (e) { alert(e.message); }
    return;
  }
  const cur = engine.getCurrentPlayer(game);
  try { engine.payBail(game, cur.id); } catch (e) { alert(e.message); }
  renderAll();
  maybeAutoPlayAI();
}

function toggleBuildMode() {
  if (!game || game.status !== 'playing' || !isMyTurn()) return;
  const cur = engine.getCurrentPlayer(game);
  const hasSt = game.board.some((c) => c.type === 'street' && c.owner === cur.id);
  if (!hasSt) { alert('暂无街道地产可建房'); return; }
  buildMode = !buildMode;
  renderAll();
}

function onCellClick(index) {
  if (!game || game.status !== 'playing' || !isMyTurn()) return;
  if (buildMode) {
    const c = game.board[index];
    if (c.owner === currentPlayerId() && c.type === 'street') {
      if (mode === 'online') {
        postJSON(`/api/game/${online.roomId}/build`, { playerId: myPlayerId, cellIndex: index })
          .then(applyState).catch((e) => alert(e.message));
      } else {
        try { engine.buildHouse(game, currentPlayerId(), index); } catch (e) { alert(e.message); }
        renderAll();
      }
    }
    return;
  }
  if (game.pendingProperty === index) doBuy();
}

// ---------------------------------------------------------------------------
// 单机 AI（仅本地模式；联机时由后端自动行动）
// ---------------------------------------------------------------------------
async function maybeAutoPlayAI() {
  if (!game || game.status !== 'playing') return;
  if (!engine.currentPlayerIsAI(game)) return;
  controlsLocked = true;
  renderControls();
  let guard = 0;
  while (game && engine.currentPlayerIsAI(game) && game.status === 'playing' && guard++ < 400) {
    await sleep(650);
    try {
      const ai = engine.getCurrentPlayer(game);
      if (game.phase === engine.PHASE.AWAITING_ACTION && game.pendingProperty != null) {
        const cell = game.board[game.pendingProperty];
        if (ai.money >= cell.price) engine.buyProperty(game, ai.id);
        else engine.skipPurchase(game, ai.id);
      } else if (game.phase === engine.PHASE.AWAITING_ROLL) {
        if (ai.inJail && ai.money >= game.config.bailCost) engine.payBail(game, ai.id);
        else engine.roll(game, ai.id);
      } else break;
      maybeAIBuild(ai);
      if (game.dice) setDice(game.dice.die1, game.dice.die2);
    } catch { break; }
    renderAll();
  }
  controlsLocked = false;
  buildMode = false;
  renderAll();
}

function maybeAIBuild(ai) {
  if (ai.money < 900) return;
  const streets = game.board.filter((c) => c.type === 'street' && c.owner === ai.id);
  if (!streets.length) return;
  const s = streets[Math.floor(Math.random() * streets.length)];
  if (ai.money >= engine.getHousePrice(s.group) + 300) {
    try { engine.buildHouse(game, ai.id, s.index); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------
function init() {
  initBoard();
  buildLocalSetup();
  switchMode('local');
  $('#btn-start').addEventListener('click', startLocal);
  $('#btn-roll').addEventListener('click', doRoll);
  $('#btn-build').addEventListener('click', toggleBuildMode);
  $('#btn-buy').addEventListener('click', doBuy);
  $('#btn-skip').addEventListener('click', doSkip);
  $('#btn-bail').addEventListener('click', doBail);
  $('#btn-restart').addEventListener('click', restart);
  $('#btn-again').addEventListener('click', restart);
  $('#tab-local').addEventListener('click', () => switchMode('local'));
  $('#tab-online').addEventListener('click', () => switchMode('online'));
  $('#btn-create-room').addEventListener('click', createRoom);
  $('#btn-join-room').addEventListener('click', joinRoom);
  $('#btn-room-ai').addEventListener('click', addAIOnline);
  $('#btn-room-start').addEventListener('click', startOnline);
  $('#btn-room-leave').addEventListener('click', leaveRoom);
  $('#room-code-display').addEventListener('click', () => {
    if (online.roomId) { navigator.clipboard?.writeText(online.roomId); alert(`已复制房间号：${online.roomId}`); }
  });
  showSetup();
}

init();
