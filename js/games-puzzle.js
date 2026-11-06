/* ============================================================
   芒果游戏盒 · 益智消除
   俄罗斯方块 / 2048 / 扫雷 / 数字华容道 / 记忆翻牌 / 猜数字
   ============================================================ */
'use strict';

/* ============================================================
   6. 俄罗斯方块
   ============================================================ */
Games.register({
  id: 'tetris', name: '俄罗斯方块', desc: '经典坠落消除', icon: '🟨', play: '方向键 / 虚拟按键',
  grad: 'linear-gradient(135deg,#ffe066,#f08c00)',
  mount(api) {
    api.tick = tick;
    const COLS = 10, ROWS = 20, CELL = 22, W = COLS * CELL, H = ROWS * CELL;
    const { ctx, clear } = makeGameCanvas(api, W, H);
    const SHAPES = {
      I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
      O: [[1, 1], [1, 1]],
      T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
      S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
      Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
      J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
      L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    };
    const COLORS = { I: '#4dd0e1', O: '#ffd75e', T: '#b197fc', S: '#7fe3a0', Z: '#ff8787', J: '#74c0fc', L: '#ffa94d' };
    let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    let piece = null, nextKey = 'I', acc = 0, dropAcc = 0, lines = 0, level = 1, dead = false;
    function newPiece() {
      const keys = Object.keys(SHAPES);
      const k = nextKey; nextKey = keys[Math.floor(Math.random() * keys.length)];
      const shape = SHAPES[k].map(r => r.slice());
      return { k, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
    }
    function collide(p, ox, oy, shape) {
      const s = shape || p.shape;
      for (let r = 0; r < s.length; r++) for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const x = p.x + c + ox, y = p.y + r + oy;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && grid[y][x]) return true;
      }
      return false;
    }
    function merge() {
      piece.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v && piece.y + r >= 0) grid[piece.y + r][piece.x + c] = piece.k;
      }));
    }
    function clearLines() {
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r].every(v => v)) {
          grid.splice(r, 1); grid.unshift(Array(COLS).fill(0)); cleared++; r++;
        }
      }
      if (cleared) {
        lines += cleared;
        api.gain(cleared * 100 * level);
        level = 1 + Math.floor(lines / 8);
        Sfx.win();
      }
    }
    function rotate(shape) {
      const n = shape.length, m = shape[0].length;
      return Array.from({ length: m }, (_, r) => Array.from({ length: n }, (_, c) => shape[n - 1 - c][r]));
    }
    function step() {
      if (!collide(piece, 0, 1)) { piece.y++; return true; }
      merge(); clearLines();
      piece = newPiece();
      if (collide(piece, 0, 0)) { dead = true; api.over(false, tf('消除 {n} 行', { n: lines })); }
      return false;
    }
    piece = newPiece();
    const K = { ArrowLeft: () => { if (!collide(piece, -1, 0)) piece.x--; }, ArrowRight: () => { if (!collide(piece, 1, 0)) piece.x++; }, ArrowDown: () => { step(); api.gain(1); }, ArrowUp: () => { const r = rotate(piece.shape); if (!collide(piece, 0, 0, r)) { piece.shape = r; Sfx.click(); } }, ' ': () => { while (step()) { } api.gain(5); } };
    api.onKey = (e, down) => { if (dead || !down) return; const fn = K[e.key]; if (fn) { e.preventDefault(); fn(); } };
    makePad(api.root, [
      { label: '◀', fn: () => !dead && K.ArrowLeft() },
      { label: '▼', fn: () => !dead && K.ArrowDown() },
      { label: '⟳', fn: () => !dead && K.ArrowUp() },
      { label: '⤓', fn: () => !dead && K[' ']() },
      { label: '▶', fn: () => !dead && K.ArrowRight() },
    ]);
    function tick(d) {
      if (dead) return;
      const dt = api.dt(d);
      dropAcc += dt;
      const speed = Math.max(120, 800 - level * 70);
      if (dropAcc >= speed) { dropAcc = 0; step(); }
      api.info(tf('行 {l} · Lv {v}', { l: lines, v: level }));
      // 绘制
      clear('#0a1f3c');
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke(); }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        ctx.fillStyle = COLORS[grid[r][c]];
        rr(ctx, c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, 4); ctx.fill();
      }
      if (piece) {
        piece.shape.forEach((row, r) => row.forEach((v, c) => {
          if (!v) return;
          ctx.fillStyle = COLORS[piece.k]; ctx.globalAlpha = 0.92;
          rr(ctx, (piece.x + c) * CELL + 1, (piece.y + r) * CELL + 1, CELL - 2, CELL - 2, 4); ctx.fill();
          ctx.globalAlpha = 1;
        }));
      }
    }
  },
});

/* ============================================================
   7. 2048
   ============================================================ */
Games.register({
  id: 'g2048', name: '2048', desc: '合成数字冲击 2048', icon: '🔢', play: '方向键 / 滑动',
  grad: 'linear-gradient(135deg,#a5d8ff,#1864ab)',
  mount(api) {
    let grid = Array.from({ length: 4 }, () => Array(4).fill(0));
    let score = 0, won = false, over = false;
    const VC = { 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' };
    function add() {
      const empty = [];
      grid.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r, c]); }));
      if (!empty.length) return;
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }
    function canMove() {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (!grid[r][c]) return true;
        if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
        if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
      }
      return false;
    }
    function slide(row) {
      const arr = row.filter(v => v);
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] === arr[i + 1]) { arr[i] *= 2; api.gain(arr[i]); if (arr[i] === 2048 && !won) { won = true; } arr.splice(i + 1, 1); }
      }
      while (arr.length < 4) arr.push(0);
      return arr;
    }
    function move(dir) {
      if (over) return;
      const old = JSON.stringify(grid);
      if (dir === 'left' || dir === 'right') {
        grid = grid.map(row => { const s = slide(dir === 'left' ? row : row.slice().reverse()); return dir === 'left' ? s : s.reverse(); });
      } else {
        for (let c = 0; c < 4; c++) {
          let col = grid.map(r => r[c]);
          if (dir === 'down') col = col.reverse();
          col = slide(col);
          if (dir === 'down') col = col.reverse();
          col.forEach((v, r) => grid[r][c] = v);
        }
      }
      if (JSON.stringify(grid) !== old) { add(); Sfx.eat(); }
      if (!canMove()) { over = true; api.over(false, tf('最大数字 {n}', { n: Math.max(...grid.flat()) })); return; }
      if (won && !over) { api.over(true, t('合成 2048！')); return; }
      draw();
    }
    api.onKey = (e, down) => {
      if (!down) return;
      const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
      if (m) { e.preventDefault(); move(m); }
    };
    api.onSwipe = (d) => move(d);
    function draw() {
      api.root.innerHTML = `<div class="g2048">${grid.map((row, r) => row.map((v, c) =>
        `<div class="g2048-cell" style="background:${v ? (VC[v] || '#edc22e') : 'rgba(255,255,255,.06)'};color:${v <= 4 && v ? '#776e65' : '#fff'};font-size:${v >= 1024 ? 18 : v >= 128 ? 22 : 26}px">${v || ''}</div>`).join('')).join('')}</div>`;
    }
    add(); add(); draw();
    api.destroy = () => { };
  },
});

/* ============================================================
   8. 扫雷
   ============================================================ */
Games.register({
  id: 'mines', name: '扫雷', desc: '逻辑推理排雷', icon: '💣', play: '点击翻开 · 长按 / 旗帜按钮标记',
  grad: 'linear-gradient(135deg,#adb5bd,#495057)',
  mount(api) {
    const R = 9, C = 9, N = 10;
    let grid = [], revealed = 0, flags = 0, flagMode = false, dead = false, started = false;
    function build() {
      grid = Array.from({ length: R }, () => Array.from({ length: C }, () => ({ m: false, n: 0, open: false, flag: false })));
      // 随机布雷（避开第一下）
      let placed = 0;
      while (placed < N) {
        const r = Math.floor(Math.random() * R), c = Math.floor(Math.random() * C);
        if (!grid[r][c].m) { grid[r][c].m = true; placed++; }
      }
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (grid[r][c].m) continue;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc].m) n++;
        }
        grid[r][c].n = n;
      }
    }
    function open(r, c) {
      const cell = grid[r][c];
      if (cell.open || cell.flag) return;
      if (!started) { /* 第一下安全 */
        started = true;
        if (cell.m) { let moved = false; for (let rr2 = 0; rr2 < R && !moved; rr2++) for (let cc = 0; cc < C && !moved; cc++) if (!grid[rr2][cc].m && !(rr2 === r && cc === c)) { grid[rr2][cc].m = true; grid[r][c].m = false; moved = true; } }
        build.count = 0;
        // 重算数字
        for (let rr2 = 0; rr2 < R; rr2++) for (let cc = 0; cc < C; cc++) { if (grid[rr2][cc].m) continue; let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = rr2 + dr, nc = cc + dc; if (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc].m) n++; } grid[rr2][cc].n = n; }
      }
      if (cell.m) {
        if (api.admin.isOn() && api.admin.invincible) { cell.flag = true; flags++; draw(); toast(t('🛡 无敌：已自动标记该雷'), 'ok'); return; }
        dead = true;
        grid.forEach(row => row.forEach(x => { if (x.m) x.open = true; }));
        draw();
        api.over(false, t('踩到雷了'));
        return;
      }
      flood(r, c);
      draw();
      revealed = grid.flat().filter(x => x.open && !x.m).length;
      if (revealed === R * C - N) { api.over(true, tf('用时 {n}s', { n: Math.round(api.getScore() / 10) })); }
    }
    function flood(r, c) {
      if (r < 0 || r >= R || c < 0 || c >= C) return;
      const cell = grid[r][c];
      if (cell.open || cell.flag) return;
      cell.open = true; Sfx.click();
      if (cell.n === 0 && !cell.m) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) flood(r + dr, c + dc);
    }
    function toggleFlag(r, c) {
      const cell = grid[r][c];
      if (cell.open) return;
      cell.flag = !cell.flag;
      flags += cell.flag ? 1 : -1;
      Sfx.click();
      draw();
    }
    function draw() {
      const NUMC = ['', '#74c0fc', '#7fe3a0', '#ffd75e', '#ffa94d', '#ff8787', '#b197fc', '#e599f7', '#f06595'];
      let h = `<div class="mines-head"><span>💣 ${N - flags}</span><button type="button" class="btn btn-ghost btn-sm" id="mineFlag">${flagMode ? t('🚩 标记中') : t('⛏ 挖矿中')}</button></div><div class="mines">`;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const x = grid[r][c];
        const cls = x.open ? (x.m ? 'mine boom' : 'open') : (x.flag ? 'flag' : '');
        const txt = x.open ? (x.m ? '💣' : (x.n ? `<b style="color:${NUMC[x.n]}">${x.n}</b>` : '')) : (x.flag ? '🚩' : '');
        h += `<button type="button" class="mines-cell ${cls}" data-r="${r}" data-c="${c}">${txt}</button>`;
      }
      h += '</div>';
      api.root.innerHTML = h;
      const fm = $('#mineFlag', api.root);
      if (fm) fm.onclick = () => { flagMode = !flagMode; draw(); };
      let timer = null;
      $$('.mines-cell', api.root).forEach(btn => {
        const r = +btn.dataset.r, c = +btn.dataset.c;
        btn.onclick = () => { if (dead) return; flagMode ? toggleFlag(r, c) : open(r, c); };
        let pt = null;
        btn.addEventListener('touchstart', () => { pt = setTimeout(() => { toggleFlag(r, c); pt = null; }, 450); }, { passive: true });
        btn.addEventListener('touchend', () => { if (pt) clearTimeout(pt); });
        btn.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleFlag(r, c); });
      });
    }
    build(); draw();
    api.info(t('左键挖矿 · 右键/长按标记'));
    /* 计时 */
    let secs = 0;
    api._timer = setInterval(() => { if (!dead && started) { secs += 1; api.setScore(secs); } }, 1000);
    api.destroy = () => clearInterval(api._timer);
  },
});

/* ============================================================
   9. 数字华容道
   ============================================================ */
Games.register({
  id: 'slide', name: '数字华容道', desc: '滑动拼出 1-15', icon: '🧩', play: '点击数字或滑动',
  grad: 'linear-gradient(135deg,#ffd8a8,#d9480f)',
  mount(api) {
    const N = 4;
    let tiles = [], moves = 0, done = false;
    function solved() { for (let i = 0; i < 15; i++) if (tiles[i] !== i + 1) return false; return tiles[15] === 0; }
    function shuffle() {
      do {
        tiles = [...Array(15).keys()].map(i => i + 1).concat([0]);
        for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
      } while (solved());
    }
    function idxOf(r, c) { return r * N + c; }
    function tryMove(pos) {
      const r = Math.floor(pos / N), c = pos % N, blank = tiles.indexOf(0), br = Math.floor(blank / N), bc = blank % N;
      if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return;
      [tiles[pos], tiles[blank]] = [tiles[blank], tiles[pos]];
      moves++; Sfx.click();
      if (solved()) { done = true; api.over(true, tf('{n} 步完成', { n: moves })); }
      api.setScore(Math.max(0, 1000 - moves * 12));
      draw();
    }
    function draw() {
      let h = '<div class="slide-grid">';
      tiles.forEach((v, i) => {
        h += `<button type="button" class="slide-cell ${v === 0 ? 'blank' : ''}" data-i="${i}">${v || ''}</button>`;
      });
      h += '</div>';
      api.root.innerHTML = h;
      $$('.slide-cell', api.root).forEach(b => b.onclick = () => { if (!done) tryMove(+b.dataset.i); });
    }
    api.onSwipe = (d) => {
      if (done) return;
      const blank = tiles.indexOf(0), r = Math.floor(blank / N), c = blank % N;
      const map = { up: [1, 0], down: [-1, 0], left: [0, 1], right: [0, -1] }[d];
      const nr = r + map[0], nc = c + map[1];
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) tryMove(idxOf(nr, nc));
    };
    shuffle(); draw();
    api.info(t('步数 0'));
    const iv = setInterval(() => { if (!done) api.info(tf('步数 {n}', { n: moves })); }, 300);
    api.destroy = () => clearInterval(iv);
  },
});

/* ============================================================
   10. 记忆翻牌
   ============================================================ */
Games.register({
  id: 'memory', name: '记忆翻牌', desc: '配对水果考验记忆', icon: '🃏', play: '点击翻牌，找出所有配对',
  grad: 'linear-gradient(135deg:#eebefa,#9c36b5)',
  mount(api) {
    const EMOJIS = ['🥭', '🍌', '🍇', '🍉', '🍓', '🍍', '🥝', '🍑'];
    let cards = [], first = null, lock = false, matched = 0, moves = 0;
    function build() {
      cards = [...EMOJIS, ...EMOJIS].map((e, i) => ({ e, id: i, open: false, done: false }))
        .sort(() => Math.random() - 0.5);
    }
    function draw() {
      api.root.innerHTML = `<div class="mem-grid">${cards.map((c, i) =>
        `<button type="button" class="mem-cell ${c.open || c.done ? 'open' : ''} ${c.done ? 'done' : ''}" data-i="${i}">${c.open || c.done ? c.e : '🥭'}</button>`).join('')}</div>`;
      $$('.mem-cell', api.root).forEach(b => b.onclick = () => flip(+b.dataset.i));
    }
    function flip(i) {
      const c = cards[i];
      if (lock || c.open || c.done) return;
      c.open = true; Sfx.click();
      if (first === null) { first = i; }
      else {
        moves++;
        if (cards[first].e === c.e) {
          cards[first].done = true; c.done = true; matched++;
          Sfx.win(); api.gain(50);
          first = null;
          if (matched === EMOJIS.length) { api.over(true, tf('{n} 步完成', { n: moves })); return; }
        } else {
          lock = true;
          Sfx.hit();
          setTimeout(() => { cards[first].open = false; c.open = false; first = null; lock = false; draw(); }, 650);
        }
      }
      api.info(tf('步数 {n} · 已配对 {a}/{b}', { n: moves, a: matched, b: EMOJIS.length }));
      draw();
    }
    build(); draw();
  },
});

/* ============================================================
   11. 猜数字
   ============================================================ */
Games.register({
  id: 'guess', name: '猜数字', desc: '十次之内猜中答案', icon: '🎯', play: '输入 1-100 之间的数字',
  grad: 'linear-gradient(135deg,#ffc9c9,#c92a2a)',
  mount(api) {
    const answer = 1 + Math.floor(Math.random() * 100);
    let left = 10, history = [], done = false, msg = '';
    function draw() {
      api.root.innerHTML = `
      <div class="guess-box">
        <p class="guess-tip">${t('我想了一个')} <b>1 ~ 100</b> ${t('的数字，你还有')} <b id="gLeft">${left}</b> ${t('次机会')}</p>
        <div class="guess-input">
          <input id="gVal" type="number" min="1" max="100" placeholder="${t('输入数字')}" autocomplete="off">
          <button class="btn btn-mango" id="gGo">${t('猜！')}</button>
        </div>
        <div class="guess-msg" id="gMsg">${msg ? esc(msg) : ''}</div>
        <div class="guess-hist">${history.map(h => `<span class="guess-chip ${h.r}">${h.v} · ${h.r === 'up' ? t('太小 ↑') : h.r === 'down' ? t('太大 ↓') : t('正确 🎉')}</span>`).join('')}</div>
      </div>`;
      const go = () => {
        if (done) return;
        const v = parseInt($('#gVal', api.root).value, 10);
        if (!v || v < 1 || v > 100) { msg = t('请输入 1~100 的整数'); draw(); return; }
        left--;
        let r = 'up';
        if (v === answer) r = 'ok';
        else if (v > answer) r = 'down';
        history.push({ v, r });
        if (r === 'ok') {
          done = true;
          api.gain(left * 100 + 100);
          api.over(true, tf('用了 {n} 次猜中', { n: 10 - left }));
        } else if (left <= 0) {
          done = true;
          api.over(false, tf('答案是 {n}', { n: answer }));
        } else {
          msg = r === 'up' ? tf('{n} 太小了，往大猜 ↑', { n: v }) : tf('{n} 太大了，往小猜 ↓', { n: v });
          Sfx.hit();
          draw();
        }
      };
      $('#gGo', api.root).onclick = go;
      $('#gVal', api.root).onkeydown = (e) => { if (e.key === 'Enter') go(); };
      setTimeout(() => $('#gVal', api.root)?.focus(), 60);
    }
    draw();
  },
});
