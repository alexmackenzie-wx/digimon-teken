// App shell: menus, game loop, local/CPU/online modes.
//
// Online model: the host runs the authoritative simulation at 60 Hz and
// streams the full game state to the guest every frame; the guest only sends
// its button presses and renders whatever the host sends back.
import { createGame, step } from './engine.js';
import { CHARS, CHAR_ORDER, STAGES, STAGE_ORDER } from './data.js';
import { render, FX, Camera, PCOLORS } from './render.js';
import { drawPortrait } from './sprites.js';
import { Input, DIGI_KEY_LABEL } from './input.js';
import { makeCpu, cpuInput } from './ai.js';
import { Net } from './net.js';
import { initAudio, playEvents, beep, toggleMute } from './audio.js';

const STEP = 1000 / 60;
const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];

const canvas = $('#game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

const input = new Input();

const app = {
  screen: 'title', mode: null, // 'cpu' | 'local' | 'host' | 'guest'
  picks: [null, null], pickSlot: 0, stage: 'file_island', stocks: 3, items: true, cpuLevel: 2,
  state: null, cfg: null, inMatch: false, cam: new Camera(), fx: new FX(), cpus: [], paused: false,
  acc: 0, last: performance.now(), net: null, guestIn: { held: 0, pressed: 0 }, lastSent: -1, lastBanner: '',
  demo: null, demoCpus: null, demoCam: new Camera(), demoFx: new FX(), demoAcc: 0, frame: 0, pingT: 0,
};

// ------------------------------------------------------------------ screens
function show(name) {
  app.screen = name;
  $$('.screen').forEach((el) => el.classList.toggle('show', el.id === 'scr-' + name));
  input.enabled = name === 'game';
  if (name === 'select') refreshSelect();
  if (name === 'stage') refreshStage();
}

let toastT = 0;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ character select
const charCanvases = {};
function buildCharGrid() {
  const grid = $('#char-grid');
  grid.innerHTML = '';
  for (const key of CHAR_ORDER) {
    const ch = CHARS[key];
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.char = key;
    const cv = document.createElement('canvas'); cv.width = 180; cv.height = 180;
    cv.style.background = `radial-gradient(circle at 50% 60%, ${ch.color}55, transparent 70%)`;
    charCanvases[key] = cv;
    const evo = document.createElement('canvas'); evo.width = 68; evo.height = 68;
    drawPortrait(evo, ch.forms[1].sprite, { scale: ch.forms[1].sprite === 'garurumon' ? 0.85 : 0.95 });
    card.append(cv);
    card.insertAdjacentHTML('beforeend', `<div class="badges"></div><div class="name">${ch.forms[0].name}</div><div class="desc">${ch.desc}</div>`);
    const evoRow = document.createElement('div'); evoRow.className = 'evo';
    evoRow.append(document.createTextNode('Digivolves → '), evo, document.createTextNode(ch.forms[1].name));
    card.append(evoRow);
    card.addEventListener('click', () => pickChar(key));
    grid.append(card);
  }
}

function slotLabel(i) {
  if (app.mode === 'cpu') return i === 0 ? 'You' : 'CPU';
  if (app.mode === 'host') return i === 0 ? 'You (P1)' : 'Opponent (P2)';
  if (app.mode === 'guest') return i === 1 ? 'You (P2)' : 'Host (P1)';
  return 'P' + (i + 1);
}

function pickChar(key) {
  beep('select');
  if (app.mode === 'host') { app.picks[0] = key; sendLobby(); }
  else if (app.mode === 'guest') { app.picks[1] = key; app.net?.send({ t: 'pick', char: key }); }
  else {
    app.picks[app.pickSlot] = key;
    const next = app.picks.findIndex((p) => !p);
    if (next >= 0) app.pickSlot = next;
  }
  refreshSelect();
}

function refreshSelect() {
  for (const card of $$('#char-grid .card')) {
    const key = card.dataset.char;
    card.classList.toggle('sel-0', app.picks[0] === key);
    card.classList.toggle('sel-1', app.picks[1] === key);
    card.querySelector('.badges').innerHTML = app.picks.map((p, i) => (p === key ? `<span class="badge p${i}">${i === 0 ? 'P1' : app.mode === 'cpu' ? 'CPU' : 'P2'}</span>` : '')).join('');
  }
  const bar = $('#pick-bar');
  const online = app.mode === 'host' || app.mode === 'guest';
  bar.innerHTML = app.picks.map((p, i) => {
    const active = !online && app.pickSlot === i;
    return `<div class="slot ${active ? 'active' : ''}" data-slot="${i}" style="border-color:${active ? '' : PCOLORS[i]}">
      <b style="color:${PCOLORS[i]}">${slotLabel(i)}</b>: ${p ? CHARS[p].forms[0].name : (online && ((app.mode === 'host' && i === 1) || (app.mode === 'guest' && i === 0)) ? 'choosing…' : '—')}</div>`;
  }).join('') + (app.mode === 'guest' ? `<div class="slot">Stage: <b>${STAGES[app.stage].name}</b></div>` : '');
  if (!online) $$('#pick-bar .slot').forEach((el) => el.addEventListener('click', () => { app.pickSlot = +el.dataset.slot; refreshSelect(); }));
  let title = 'Choose your Digimon';
  if (app.mode === 'local') title = `Player ${app.pickSlot + 1}: choose your Digimon`;
  if (app.mode === 'cpu') title = app.pickSlot === 0 ? 'Choose your Digimon' : 'Choose the CPU\'s Digimon';
  if (app.mode === 'guest') title = app.picks[1] ? 'Waiting for the host to start…' : 'Choose your Digimon';
  $('#select-title').textContent = title;
  const next = $('#btn-select-next');
  next.classList.toggle('hidden', app.mode === 'guest');
  next.disabled = app.mode === 'host' ? !app.picks[0] : !(app.picks[0] && app.picks[1]);
}

// ------------------------------------------------------------------ stage select
function buildStageGrid() {
  const grid = $('#stage-grid');
  grid.innerHTML = '';
  for (const key of STAGE_ORDER) {
    const card = document.createElement('div');
    card.className = 'card stage'; card.dataset.stage = key;
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 225;
    const pc = cv.getContext('2d');
    const s = createGame({ stage: key, players: [{ char: 'agumon' }, { char: 'gabumon' }], items: false });
    for (let k = 0; k < 20; k++) step(s, []);
    const cam = new Camera(); cam.update(s, 400, 225, true);
    render(pc, s, cam, new FX(), 400, 225, { noHud: true, noTags: true });
    card.append(cv);
    card.insertAdjacentHTML('beforeend', `<div class="name">${STAGES[key].name}</div>`);
    card.addEventListener('click', () => { app.stage = key; beep('select'); refreshStage(); if (app.mode === 'host') sendLobby(); });
    grid.append(card);
  }
}

function refreshStage() {
  $$('#stage-grid .card').forEach((c) => c.classList.toggle('chosen', c.dataset.stage === app.stage));
  $('#opt-cpu-wrap').classList.toggle('hidden', app.mode !== 'cpu');
  const wait = $('#stage-wait');
  const waiting = app.mode === 'host' && !app.picks[1];
  wait.classList.toggle('hidden', !waiting);
  wait.textContent = waiting ? 'Waiting for your opponent to pick a Digimon…' : '';
  $('#btn-fight').disabled = waiting || (app.mode === 'host' && !app.net?.connected);
}

$('#opt-stocks').addEventListener('change', (e) => { app.stocks = +e.target.value; });
$('#opt-items').addEventListener('change', (e) => { app.items = e.target.value === '1'; });
$('#opt-cpu').addEventListener('change', (e) => { app.cpuLevel = +e.target.value; });

// ------------------------------------------------------------------ match
function matchConfig() {
  return {
    stage: app.stage, stocks: app.stocks, items: app.items, seed: (Math.random() * 2 ** 31) >>> 0,
    players: [
      { char: app.picks[0] },
      { char: app.picks[1], cpu: app.mode === 'cpu' },
    ],
  };
}

function startMatch(cfg) {
  app.cfg = cfg;
  app.state = createGame(cfg);
  app.state.cd = 180;
  app.cpus = cfg.players.map((p) => (p.cpu ? makeCpu(app.cpuLevel) : null));
  if (app.mode === 'local') input.setSlots([{ layout: 'p1', pad: 0 }, { layout: 'p2', pad: 1 }]);
  else input.setSlots([{ layout: 'solo', pad: 0 }]);
  app.guestIn = { held: 0, pressed: 0 };
  app.lastSent = -1;
  app.fx.reset(); app.fx.banner = null; app.lastBanner = '';
  app.cam = new Camera(); app.cam.update(app.state, W, H, true);
  app.paused = false; app.acc = 0; app.inMatch = true;
  show('game');
}

function digiKeys() {
  if (app.mode === 'local') return [DIGI_KEY_LABEL.p1, DIGI_KEY_LABEL.p2];
  if (app.mode === 'guest') return ['', DIGI_KEY_LABEL.solo];
  return [DIGI_KEY_LABEL.solo, ''];
}

const round2 = (k, v) => (k === 'memo' ? undefined : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
const snapshot = (s) => JSON.parse(JSON.stringify(s, round2));

function simStep() {
  const s = app.state;
  const inputs = s.fighters.map((f) => {
    if (app.cpus[f.i]) return cpuInput(s, f.i, app.cpus[f.i]);
    if (app.mode === 'host' && f.i === 1) { const g = { ...app.guestIn }; app.guestIn.pressed = 0; return g; }
    return input.poll(app.mode === 'local' ? f.i : 0);
  });
  if (s.cd > 0) { s.cd--; s.events = []; } else step(s, inputs);
  afterStep(s);
  if (app.mode === 'host') app.net?.send({ t: 's', s: snapshot(s) });
}

function bannerFor(s) {
  if (s.cd > 0) return { text: String(Math.ceil(s.cd / 60)), col: '#ffffff' };
  if (s.over) return { text: 'GAME!', col: '#ffd23d' };
  if (s.frame < 50) return { text: 'GO!', col: '#3ddc84' };
  return null;
}

function afterStep(s) {
  app.fx.handle(s.events, s);
  playEvents(s.events);
  app.fx.tick(s);
  const b = bannerFor(s);
  app.fx.banner = b;
  const txt = b ? b.text : '';
  if (txt !== app.lastBanner) {
    if (txt === 'GO!') beep('go'); else if (txt === 'GAME!') beep('game'); else if (txt) beep('count');
    app.lastBanner = txt;
  }
  if (s.over && s.overT >= 150 && app.inMatch) showResults();
}

function showResults() {
  app.inMatch = false;
  const s = app.state;
  const win = s.fighters[s.winner];
  $('#results-title').textContent = win ? `${win.cpu ? 'CPU' : 'P' + (win.i + 1)} ${CHARS[win.char].forms[0].name} wins!` : 'Draw!';
  const body = $('#results-body');
  body.innerHTML = '';
  const order = [...s.fighters].sort((a, b) => (a.i === s.winner ? -1 : b.i === s.winner ? 1 : 0));
  for (const f of order) {
    const div = document.createElement('div');
    div.className = 'res' + (f.i === s.winner ? ' win' : '');
    div.style.borderColor = f.i === s.winner ? '' : PCOLORS[f.i];
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160;
    const sprite = CHARS[f.char].forms[f.i === s.winner ? 1 : 0].sprite;
    drawPortrait(cv, sprite, { scale: sprite === 'garurumon' ? 1.6 : sprite === 'patamon' ? 2.4 : 1.8 });
    div.append(cv);
    div.insertAdjacentHTML('beforeend', `<div class="name" style="color:${PCOLORS[f.i]}">${f.cpu ? 'CPU' : 'P' + (f.i + 1)} · ${CHARS[f.char].forms[0].name}</div>
      <table><tr><td>KOs</td><td>${f.stats.kos}</td></tr><tr><td>Falls</td><td>${f.stats.falls}</td></tr>
      <tr><td>Damage dealt</td><td>${Math.round(f.stats.dealt)}%</td></tr><tr><td>Digivolutions</td><td>${f.stats.digis}</td></tr></table>`);
    body.append(div);
  }
  const guest = app.mode === 'guest';
  $('#results-wait').classList.toggle('hidden', !guest);
  $$('#results-buttons [data-act="rematch"], #results-buttons [data-act="to-select"]').forEach((b) => b.classList.toggle('hidden', guest));
  show('results');
}

function quitToTitle() {
  app.inMatch = false; app.state = null; app.paused = false;
  if (app.net) { app.net.close(); app.net = null; }
  app.mode = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  $('#ping').textContent = '';
  show('title');
}

// ------------------------------------------------------------------ online
function sendLobby() {
  app.net?.send({ t: 'lobby', picks: app.picks, stage: app.stage });
}

function startHost() {
  app.mode = 'host'; app.picks = [null, null];
  $('#online-title').textContent = 'Host an Online Battle';
  $('#online-status').textContent = 'Creating room…';
  $('#online-link-box').classList.add('hidden');
  show('online');
  if (typeof Peer === 'undefined') { $('#online-status').textContent = 'Networking library failed to load.'; return; }
  app.net = new Net({
    onOpen(code) {
      const link = `${location.origin}${location.pathname}#join=${code}`;
      $('#online-link').value = link;
      $('#online-status').innerHTML = `Room <b>${code.toUpperCase()}</b> is open!`;
      $('#online-link-box').classList.remove('hidden');
      $('#btn-share').classList.toggle('hidden', !navigator.share);
    },
    onConnect() { toast('Opponent connected! 🎉'); sendLobby(); app.pickSlot = 0; show('select'); },
    onData: hostData,
    onClose: netLost,
    onError(msg) { $('#online-status').textContent = msg; toast(msg, 4000); },
  });
  app.net.host();
}

function hostData(m) {
  switch (m.t) {
    case 'i': app.guestIn.held = m.h; app.guestIn.pressed |= m.p; break;
    case 'pick': app.picks[1] = m.char; sendLobby(); if (app.screen === 'select') refreshSelect(); if (app.screen === 'stage') refreshStage(); break;
    case 'hello': sendLobby(); break;
    case 'ping': app.net.send({ t: 'pong', ts: m.ts }); break;
    case 'pong': $('#ping').textContent = `ping ${Math.round(performance.now() - m.ts)} ms`; break;
  }
}

function startGuest(code) {
  app.mode = 'guest'; app.picks = [null, null];
  $('#online-title').textContent = 'Joining Battle';
  $('#online-status').textContent = `Connecting to room ${code.toUpperCase()}…`;
  $('#online-link-box').classList.add('hidden');
  show('online');
  if (typeof Peer === 'undefined') { $('#online-status').textContent = 'Networking library failed to load.'; return; }
  app.net = new Net({
    onConnect() { app.net.send({ t: 'hello' }); toast('Connected! Pick your Digimon.'); show('select'); },
    onData: guestData,
    onClose: netLost,
    onError(msg) { $('#online-status').textContent = msg; if (app.screen !== 'online') toast(msg, 4000); },
  });
  app.net.join(code);
}

function guestData(m) {
  switch (m.t) {
    case 'lobby':
      app.picks[0] = m.picks[0]; if (m.picks[1]) app.picks[1] = m.picks[1]; app.stage = m.stage;
      if (app.screen === 'select') refreshSelect();
      break;
    case 'start': startMatch(m.cfg); break;
    case 's':
      if (!app.inMatch) break;
      app.state = m.s;
      afterStep(app.state);
      break;
    case 'select': app.inMatch = false; show('select'); break;
    case 'full': toast('That room is already full.', 4000); quitToTitle(); break;
    case 'ping': app.net.send({ t: 'pong', ts: m.ts }); break;
    case 'pong': $('#ping').textContent = `ping ${Math.round(performance.now() - m.ts)} ms`; break;
  }
}

function netLost(reason) {
  if (!app.mode) return;
  toast(reason || 'Connection lost.', 4000);
  quitToTitle();
}

// ------------------------------------------------------------------ actions
const actions = {
  online() { startHost(); },
  cpu() { app.mode = 'cpu'; app.picks = [null, null]; app.pickSlot = 0; show('select'); },
  local() { app.mode = 'local'; app.picks = [null, null]; app.pickSlot = 0; show('select'); },
  help() { show('help'); },
  title() { show(app.inMatch ? 'pause' : 'title'); },
  leave() { quitToTitle(); },
  'select-back'() { quitToTitle(); },
  'select-next'() { show('stage'); },
  'stage-back'() { show('select'); },
  fight() {
    const cfg = matchConfig();
    if (app.mode === 'host') {
      if (!app.picks[1]) return;
      app.net.send({ t: 'start', cfg });
    }
    startMatch(cfg);
  },
  rematch() {
    const cfg = { ...app.cfg, seed: (Math.random() * 2 ** 31) >>> 0 };
    if (app.mode === 'host') app.net.send({ t: 'start', cfg });
    startMatch(cfg);
  },
  'to-select'() {
    if (app.mode === 'host') app.net.send({ t: 'select' });
    app.state = null; show('select');
  },
  quit() { if (app.mode === 'host' || app.mode === 'guest') quitToTitle(); else { app.inMatch = false; app.state = null; show('title'); } },
  resume() { app.paused = false; show('game'); },
  'help-ingame'() { show('help'); },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && actions[b.dataset.act]) { initAudio(); actions[b.dataset.act](); }
});

$('#btn-copy').addEventListener('click', async () => {
  const el = $('#online-link');
  try { await navigator.clipboard.writeText(el.value); } catch { el.select(); document.execCommand('copy'); }
  toast('Link copied! Send it to your opponent.');
});
$('#btn-share').addEventListener('click', () => {
  navigator.share?.({ title: 'Digi Smash', text: 'Fight me in Digi Smash!', url: $('#online-link').value }).catch(() => {});
});
$('#btn-mute').addEventListener('click', (e) => { initAudio(); e.currentTarget.textContent = toggleMute() ? '🔇' : '🔊'; e.currentTarget.blur(); });
$('#btn-full').addEventListener('click', (e) => {
  e.currentTarget.blur();
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
});

addEventListener('keydown', (e) => {
  initAudio();
  if (e.code !== 'Escape') return;
  if (app.screen === 'game' && app.inMatch) { app.paused = app.mode === 'local' || app.mode === 'cpu'; show('pause'); }
  else if (app.screen === 'pause') actions.resume();
});
addEventListener('pointerdown', () => initAudio(), { once: true });

// ------------------------------------------------------------------ attract-mode demo behind menus
function newDemo() {
  const a = CHAR_ORDER[Math.floor(Math.random() * 4)];
  let b = CHAR_ORDER[Math.floor(Math.random() * 4)];
  if (b === a) b = CHAR_ORDER[(CHAR_ORDER.indexOf(a) + 1) % 4];
  const stage = STAGE_ORDER[Math.floor(Math.random() * STAGE_ORDER.length)];
  app.demo = createGame({ stage, stocks: 2, players: [{ char: a, cpu: true }, { char: b, cpu: true }] });
  app.demoCpus = [makeCpu(3), makeCpu(3)];
  app.demoFx.reset();
  app.demoCam = new Camera(); app.demoCam.update(app.demo, W, H, true);
}

function demoStep() {
  const s = app.demo;
  step(s, app.demoCpus.map((c, i) => cpuInput(s, i, c)));
  app.demoFx.handle(s.events, s);
  app.demoFx.tick(s);
  if (s.over && s.overT > 120) newDemo();
}

// ------------------------------------------------------------------ main loop
function loop(now) {
  requestAnimationFrame(loop);
  let dt = now - app.last;
  app.last = now;
  if (dt > 250) dt = 250;
  app.frame++;

  if (app.inMatch && app.state) {
    if (app.mode === 'guest') {
      app.acc += dt;
      while (app.acc >= STEP) {
        app.acc -= STEP;
        const inp = input.poll(0);
        if (inp.pressed || inp.held !== app.lastSent) { app.net?.send({ t: 'i', h: inp.held, p: inp.pressed }); app.lastSent = inp.held; }
      }
    } else if (!app.paused) {
      app.acc += dt;
      let n = 0;
      while (app.acc >= STEP && n < 5) { simStep(); app.acc -= STEP; n++; }
      if (n === 5) app.acc = 0;
    }
    if (app.net && (app.pingT += dt) > 2000) { app.pingT = 0; app.net.send({ t: 'ping', ts: performance.now() }); }
    if (!app.state) return; // match was quit during the step
    app.cam.update(app.state, W, H);
    render(ctx, app.state, app.cam, app.fx, W, H, { digiKeys: digiKeys() });
  } else if (app.screen === 'results' && app.state) {
    render(ctx, app.state, app.cam, app.fx, W, H, { noHud: true });
  } else {
    if (!app.demo) newDemo();
    app.demoAcc += dt;
    let n = 0;
    while (app.demoAcc >= STEP && n < 4) { demoStep(); app.demoAcc -= STEP; n++; }
    if (n === 4) app.demoAcc = 0;
    app.demoCam.update(app.demo, W, H);
    render(ctx, app.demo, app.demoCam, app.demoFx, W, H, { noHud: true, noTags: true });
  }

  if (app.screen === 'select') {
    for (const key of CHAR_ORDER) {
      const cv = charCanvases[key];
      if (!cv) continue;
      const picked = app.picks.includes(key);
      drawPortrait(cv, CHARS[key].forms[0].sprite, { t: app.frame, scale: key === 'patamon' ? 2.9 : 2.2, atk: picked ? { pose: 'f', p: 0.5 + 0.5 * Math.sin(app.frame * 0.15) } : null });
    }
  }
}

// ------------------------------------------------------------------ boot
buildCharGrid();
buildStageGrid();
show('title');
const join = location.hash.match(/join=([a-z0-9]+)/i);
if (join) startGuest(join[1].toLowerCase());
requestAnimationFrame(loop);

// expose for debugging in the console
window.digi = app;
