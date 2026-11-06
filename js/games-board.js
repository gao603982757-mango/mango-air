/* ============================================================
   芒果游戏盒 · 棋牌对战
   五子棋 / 井字棋 / 中国象棋 / 打地鼠
   ============================================================ */
'use strict';

/* ============================================================
   12. 五子棋（人机）
   ============================================================ */
Games.register({
  id: 'gomoku', name: '五子棋', desc: '人机对弈十五路', icon: '⚫', play: '点击交叉点落子',
  grad: 'linear-gradient(135deg,#ced4da,#343a40)',
  mount(api) {
    const N = 13;
    let board = Array.from({ length: N }, () => Array(N).fill(0)); // 0空 1黑(你) 2白(AI)
    let over = false, hintCell = null;
    const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
    function winAt(r, c, p) {
      for (const [dr, dc] of DIRS) {
        let n = 1;
        for (const s of [1, -1]) {
          let nr = r + dr * s, nc = c + dc * s;
          while (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] === p) { n++; nr += dr * s; nc += dc * s; }
        }
        if (n >= 5) return true;
      }
      return false;
    }
    function lineScore(count, open) {
      if (count >= 5) return 100000;
      if (count === 4) return open ? 10000 : 1000;
      if (count === 3) return open ? 1000 : 100;
      if (count === 2) return open ? 100 : 10;
      return 1;
    }
    function pointScore(r, c, p) {
      let total = 0;
      for (const [dr, dc] of DIRS) {
        let count = 1, open = 0;
        for (const s of [1, -1]) {
          let nr = r + dr * s, nc = c + dc * s;
          while (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] === p) { count++; nr += dr * s; nc += dc * s; }
          if (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] === 0) open++;
        }
        total += lineScore(count, open);
      }
      return total;
    }
    function aiMove() {
      let best = -1, br = -1, bc = -1;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (board[r][c]) continue;
        if (!board.some((row, rr) => row.some((v, cc) => v && Math.abs(rr - r) <= 2 && Math.abs(cc - c) <= 2))) continue;
        const s = pointScore(r, c, 2) * 1.1 + pointScore(r, c, 1) + Math.random() * 8;
        if (s > best) { best = s; br = r; bc = c; }
      }
      if (br < 0) { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!board[r][c]) { br = r; bc = c; } }
      board[br][bc] = 2;
      return [br, bc];
    }
    function draw() {
      let h = `<div class="gomoku-board" style="--n:${N}">`;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const v = board[r][c];
        const star = (r === 3 || r === N - 4) && (c === 3 || c === N - 4) ? ' star' : '';
        h += `<button type="button" class="go-cell${star} ${v ? 'p' + v : ''}" data-r="${r}" data-c="${c}">${v ? '' : (hintCell && hintCell[0] === r && hintCell[1] === c && api.admin.isOn() && api.admin.hint ? '<i class="go-hint"></i>' : '')}</button>`;
      }
      h += '</div>';
      api.root.innerHTML = h;
      $$('.go-cell', api.root).forEach(b => b.onclick = () => {
        if (over) return;
        const r = +b.dataset.r, c = +b.dataset.c;
        if (board[r][c]) return;
        board[r][c] = 1; Sfx.click();
        if (winAt(r, c, 1)) { draw(); api.gain(500); api.over(true, t('你赢了！五子连珠')); over = true; return; }
        const [ar, ac] = aiMove();
        api.gain(5);
        draw();
        if (winAt(ar, ac, 2)) { api.over(false, t('AI 五子连珠')); over = true; return; }
        if (board.every(row => row.every(v => v))) { api.over(true, t('平局')); over = true; }
        // 提示：为你算一步
        if (api.admin.isOn() && api.admin.hint) {
          let bs = -1, hr = -1, hc = -1;
          for (let r2 = 0; r2 < N; r2++) for (let c2 = 0; c2 < N; c2++) {
            if (board[r2][c2]) continue;
            const s = pointScore(r2, c2, 1) * 1.1 + pointScore(r2, c2, 2);
            if (s > bs) { bs = s; hr = r2; hc = c2; }
          }
          hintCell = [hr, hc]; draw();
        }
      });
    }
    draw();
  },
});

/* ============================================================
   13. 井字棋（极小化极大，不可战胜）
   ============================================================ */
Games.register({
  id: 'tictactoe', name: '井字棋', desc: '三连成线即胜', icon: '⭕', play: '点击格子落子',
  grad: 'linear-gradient(135deg,#a5d8ff,#1971c2)',
  mount(api) {
    let b = Array(9).fill(''), over = false, score = { you: 0, ai: 0, draw: 0 };
    const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    function winner(p) { return LINES.find(l => l.every(i => b[i] === p)); }
    function minimax(player, depth) {
      const w = winner('O'); if (w) return 10 - depth;
      const w2 = winner('X'); if (w2) return depth - 10;
      if (b.every(v => v)) return 0;
      let best = player === 'O' ? -99 : 99;
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = player;
        const s = minimax(player === 'O' ? 'X' : 'O', depth + 1);
        b[i] = '';
        best = player === 'O' ? Math.max(best, s) : Math.min(best, s);
      }
      return best;
    }
    function aiMove() {
      let best = -99, bi = -1;
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = 'O';
        const s = minimax('X', 0);
        b[i] = '';
        if (s > best) { best = s; bi = i; }
      }
      return bi;
    }
    function draw() {
      api.root.innerHTML = `<div class="ttt-board">${b.map((v, i) =>
        `<button type="button" class="ttt-cell" data-i="${i}">${v === 'X' ? '❌' : v === 'O' ? '⭕' : ''}</button>`).join('')}</div>
        <div class="ttt-score">${tf('你 {a} : {b} 电脑 · 平 {c}', { a: score.you, b: score.ai, c: score.draw })}</div>`;
      $$('.ttt-cell', api.root).forEach(btn => btn.onclick = () => {
        if (over) return;
        const i = +btn.dataset.i;
        if (b[i]) return;
        b[i] = 'X'; Sfx.click();
        if (winner('X')) { draw(); score.you++; api.gain(100); api.over(true, t('你赢了！（极小化极大 AI 也会输）')); over = true; return; }
        if (b.every(v => v)) { draw(); score.draw++; api.gain(30); api.over(true, t('平局')); over = true; return; }
        const ai = aiMove();
        if (ai >= 0) b[ai] = 'O';
        draw();
        if (winner('O')) { score.ai++; api.over(false, t('电脑连成三线')); over = true; return; }
        if (b.every(v => v)) { score.draw++; api.gain(30); api.over(true, t('平局')); over = true; }
      });
    }
    draw();
  },
});

/* ============================================================
   14. 中国象棋（规则引擎 + 两层搜索 AI）
   ============================================================ */
Games.register({
  id: 'xiangqi', name: '中国象棋', desc: '楚河汉界人机对弈', icon: '帅', play: '点击选子再点目标位',
  grad: 'linear-gradient(135deg,#ffd8a8,#a61e1e)',
  mount(api) {
    const RED = 'r', BLACK = 'b';
    // 棋盘 9 列 × 10 行，行 0 在上（黑方底线），行 9 在下（红方底线）
    const NAMES = {
      r: { k: '帅', a: '仕', b: '相', n: '马', c: '车', p: '炮', s: '兵' },
      b: { k: '将', a: '士', b: '象', n: '马', c: '车', p: '炮', s: '卒' },
    };
    const VALUE = { k: 10000, c: 900, n: 400, p: 450, a: 200, b: 200, s: 100 };
    let board = [], sel = null, over = false, turn = RED, lastMove = null, thinking = false;
      /* 标准摆法：底线 车马相仕帅仕相马车，炮在（2,1）（2,7），兵卒在第三行奇数隔位 */
      function standardBoard() {
        const b = Array.from({ length: 10 }, () => Array(9).fill(null));
        const back = ['c', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'c'];
        back.forEach((t, c) => { b[0][c] = { s: BLACK, t }; b[9][c] = { s: RED, t }; });
        b[2][1] = { s: BLACK, t: 'p' }; b[2][7] = { s: BLACK, t: 'p' };
        b[7][1] = { s: RED, t: 'p' }; b[7][7] = { s: RED, t: 'p' };
        for (let c = 0; c < 9; c += 2) { b[3][c] = { s: BLACK, t: 's' }; b[6][c] = { s: RED, t: 's' }; }
        return b;
      }
    board = standardBoard();
    const inb = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
    const inPalace = (s, r, c) => c >= 3 && c <= 5 && (s === RED ? r >= 7 : r <= 2);
    function genMoves(r, c, bd) {
      const p = bd[r][c]; if (!p) return [];
      const moves = [];
      const add = (nr, nc) => { if (inb(nr, nc) && (!bd[nr][nc] || bd[nr][nc].s !== p.s)) moves.push([nr, nc]); };
      const own = (nr, nc) => bd[nr][nc] && bd[nr][nc].s === p.s;
      if (p.t === 'c') {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let nr = r + dr, nc = c + dc;
          while (inb(nr, nc) && !bd[nr][nc]) { moves.push([nr, nc]); nr += dr; nc += dc; }
          if (inb(nr, nc) && !own(nr, nc)) moves.push([nr, nc]);
        }
      } else if (p.t === 'p') {
        const dr = p.s === RED ? -1 : 1;
        if (inb(r + dr, c) && !own(r + dr, c)) moves.push([r + dr, c]);
        const crossed = p.s === RED ? r <= 4 : r >= 5;
        if (crossed) { [[0, 1], [0, -1]].forEach(([_, dc]) => { if (inb(r, c + dc) && !own(r, c + dc)) moves.push([r, c + dc]); }); }
      } else if (p.t === 'n') {
        [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (!inb(nr, nc)) return;
          const lr = r + (Math.abs(dr) === 2 ? dr / 2 : 0), lc = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
          if (bd[lr][lc]) return; // 蹩马腿
          if (!own(nr, nc)) moves.push([nr, nc]);
        });
      } else if (p.t === 'b') {
        [[-2, -2], [-2, 2], [2, -2], [2, 2]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (!inb(nr, nc)) return;
          if (p.s === RED ? nr < 5 : nr > 4) return; // 不过河
          if (bd[r + dr / 2][c + dc / 2]) return; // 塞象眼
          if (!own(nr, nc)) moves.push([nr, nc]);
        });
      } else if (p.t === 'a') {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (inb(nr, nc) && inPalace(p.s, nr, nc) && !own(nr, nc)) moves.push([nr, nc]);
        });
      } else if (p.t === 'k') {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (inb(nr, nc) && inPalace(p.s, nr, nc) && !own(nr, nc)) moves.push([nr, nc]);
        });
      } else if (p.t === 's') { /* 's' unused here */ }
      return moves;
    }
    /* 炮：车式移动 + 隔一子吃 */
    function genCannon(r, c, bd) {
      const p = bd[r][c];
      const moves = [];
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nr = r + dr, nc = c + dc, jumped = false;
        while (inb(nr, nc)) {
          if (!jumped) {
            if (!bd[nr][nc]) moves.push([nr, nc]);
            else jumped = true;
          } else {
            if (bd[nr][nc]) { if (bd[nr][nc].s !== p.s) moves.push([nr, nc]); break; }
          }
          nr += dr; nc += dc;
        }
      }
      return moves;
    }
    /* 覆盖：炮走 cannon */
    const _origGen = genMoves;
    genMoves = function (r, c, bd) { const p = bd[r] && bd[r][c]; if (p && p.t === 'p') return genCannon(r, c, bd); return _origGen(r, c, bd); };
    function findKing(s, bd) { for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (bd[r][c] && bd[r][c].t === 'k' && bd[r][c].s === s) return [r, c]; return null; }
    function inCheck(s, bd) {
      const kp = findKing(s, bd); if (!kp) return true;
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
        const p = bd[r][c];
        if (!p || p.s === s) continue;
        if (genMoves(r, c, bd).some(([nr, nc]) => nr === kp[0] && nc === kp[1])) return true;
      }
      return false;
    }
    function allMoves(s, bd) {
      const list = [];
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
        const p = bd[r][c];
        if (!p || p.s !== s) continue;
        genMoves(r, c, bd).forEach(m => list.push({ fr: r, fc: c, tr: m[0], tc: m[1] }));
      }
      return list;
    }
    function evaluate(s, bd) { // s 方视角分差
      let mine = 0, his = 0;
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
        const p = bd[r][c]; if (!p) continue;
        const adv = p.s === RED ? (7 - Math.abs(r - 7)) * 0.5 : (7 - Math.abs(r - 2)) * 0.5;
        const v = VALUE[p.t] + adv + (r >= 5 ? 2 : 0);
        if (p.s === s) mine += v; else his += v;
      }
      return mine - his;
    }
    function search(s, depth) {
      const opp = s === RED ? BLACK : RED;
      let best = null, bestV = -1e9;
      const moves = allMoves(s, board);
      // 简单排序：先看吃子大的
      moves.sort((a, b2) => (VALUE[board[b2.tr] && board[b2.tr].t || 's'] || 0) - (VALUE[board[a.tr] && board[a.tr].t || 's'] || 0));
      for (const m of moves) {
        const cap = board[m.tr][m.tc];
        board[m.tr][m.tc] = board[m.fr][m.fc];
        board[m.fr][m.fc] = null;
        let v;
        if (inCheck(s, board)) v = -1e8;
        else if (depth <= 1) v = evaluate(s, board);
        else {
          // 对手最佳回应
          let ov = 1e9;
          for (const om of allMoves(opp, board)) {
            const cap2 = board[om.tr][om.tc];
            board[om.tr][om.tc] = board[om.fr][om.fc];
            board[om.fr][om.fc] = null;
            const sv = evaluate(s, board);
            board[om.fr][om.fc] = board[om.tr][om.tc];
            board[om.tr][om.tc] = cap2;
            if (sv < ov) ov = sv;
          }
          v = ov;
        }
        board[m.fr][m.fc] = board[m.tr][m.tc];
        board[m.tr][m.tc] = cap;
        if (v > bestV) { bestV = v; best = m; }
      }
      return best;
    }
    function legalForPlayer(r, c) {
      return genMoves(r, c, board).filter(m => {
        const cap = board[m[0]][m[1]];
        board[m[0]][m[1]] = board[r][c]; board[r][c] = null;
        const ok = !inCheck(RED, board);
        board[r][c] = board[m[0]][m[1]]; board[m[0]][m[1]] = cap;
        return ok;
      });
    }
    function draw() {
      const CELL = 36, W = 8 * CELL + 2 * CELL, H = 9 * CELL + 2 * CELL;
      let h = `<div class="xq-wrap"><div class="xq-board" style="--cell:${CELL}px;--w:${W}px;--h:${H}px">`;
      // 网格线
      for (let r = 0; r < 10; r++) h += `<i class="xq-line ${r === 0 || r === 9 ? 'edge' : ''}" style="top:${CELL + r * CELL}px;left:${CELL}px;width:${8 * CELL}px"></i>`;
      for (let c = 0; c < 9; c++) {
        const top = c === 0 || c === 8 ? CELL : 2 * CELL;
        h += `<i class="xq-line v" style="left:${CELL + c * CELL}px;top:${top}px;height:${c === 0 || c === 8 ? 9 * CELL : 7 * CELL}px"></i>`;
      }
      // 九宫斜线
      h += `<i class="xq-line d" style="left:${CELL + 3 * CELL}px;top:${CELL}px;width:${2 * CELL}px;height:${2 * CELL}px"></i>`;
      h += `<i class="xq-line d2" style="left:${CELL + 3 * CELL}px;top:${CELL}px;width:${2 * CELL}px;height:${2 * CELL}px"></i>`;
      h += `<i class="xq-line d" style="left:${CELL + 3 * CELL}px;top:${CELL + 7 * CELL}px;width:${2 * CELL}px;height:${2 * CELL}px"></i>`;
      h += `<i class="xq-line d2" style="left:${CELL + 3 * CELL}px;top:${CELL + 7 * CELL}px;width:${2 * CELL}px;height:${2 * CELL}px"></i>`;
      // 楚河汉界
      h += `<span class="xq-river" style="top:${CELL + 4 * CELL}px;left:${CELL}px;width:${8 * CELL}px">楚 河        漢 界</span>`;
      // 落点
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        const x = CELL + c * CELL, y = CELL + r * CELL;
        if (p) {
          const isSel = sel && sel[0] === r && sel[1] === c;
          h += `<button type="button" class="xq-piece ${p.s === RED ? 'red' : 'black'} ${isSel ? 'sel' : ''}" data-r="${r}" data-c="${c}" style="left:${x}px;top:${y}px">${NAMES[p.s][p.t]}</button>`;
        } else if (sel && legalForPlayer(sel[0], sel[1]).some(m => m[0] === r && m[1] === c)) {
          h += `<button type="button" class="xq-dot" data-r="${r}" data-c="${c}" style="left:${x}px;top:${y}px"></button>`;
        }
      }
      h += '</div></div>';
      api.root.innerHTML = h;
      $$('.xq-piece, .xq-dot', api.root).forEach(b => b.onclick = () => {
        if (over || thinking || turn !== RED) return;
        const r = +b.dataset.r, c = +b.dataset.c;
        const p = board[r][c];
        if (sel && legalForPlayer(sel[0], sel[1]).some(m => m[0] === r && m[1] === c)) {
          // 走棋
          const cap = board[r][c];
          board[r][c] = board[sel[0]][sel[1]];
          board[sel[0]][sel[1]] = null;
          sel = null; turn = BLACK;
          if (cap && cap.t === 'k') { draw(); api.over(true, t('擒将！你赢了')); over = true; return; }
          if (!cap) api.gain(2);
          draw();
          // AI 回合
          thinking = true;
          api.setStatus(t('电脑思考中…'));
          setTimeout(() => {
            const m = search(BLACK, 2);
            if (!m) { api.over(true, t('电脑无棋可走，你赢了')); over = true; return; }
            const cap2 = board[m.tr][m.tc];
            board[m.tr][m.tc] = board[m.fr][m.fc];
            board[m.fr][m.fc] = null;
            turn = RED; thinking = false;
            api.setStatus('');
            if (cap2 && cap2.t === 'k') { draw(); api.over(false, t('你的将被吃了')); over = true; return; }
            if (cap2) api.gain(VALUE[cap2.t] / 2);
            draw();
          }, 420);
        } else if (p && p.s === RED) {
          sel = [r, c]; Sfx.click(); draw();
        }
      });
    }
    api.info(t('红先 · 你执红'));
    draw();
  },
});

/* ============================================================
   15. 打地鼠
   ============================================================ */
Games.register({
  id: 'whack', name: '打地鼠', desc: '30 秒速打挑战', icon: '🐹', play: '点击冒头的地鼠',
  grad: 'linear-gradient(135deg,#d8f5a2,#5c940d)',
  mount(api) {
    let score = 0, timeLeft = 30, alive = [false, false, false, false, false, false, false, false, false];
    let over = false, hitCount = 0;
    const TYPES = ['m', 'm', 'm', 'g', 'b']; // 普通 / 金鼠 / 炸弹
    function pop() {
      if (over) return;
      const idx = Math.floor(Math.random() * 9);
      alive[idx] = TYPES[Math.floor(Math.random() * TYPES.length)];
      draw();
      setTimeout(() => { if (!over) { alive[idx] = false; draw(); } }, 900 - (30 - timeLeft) * 18);
    }
    function draw() {
      const emo = { m: '🐹', g: '🌟', b: '💣' };
      api.root.innerHTML = `<div class="whack-grid">${alive.map((v, i) =>
        `<button type="button" class="whack-cell ${v ? 'up ' + v : ''}" data-i="${i}">${v ? emo[v] : ''}</button>`).join('')}</div>`;
      $$('.whack-cell', api.root).forEach(b => b.onclick = () => {
        if (over) return;
        const i = +b.dataset.i, v = alive[i];
        if (!v) { api.gain(-2); Sfx.hit(); return; }
        alive[i] = false; hitCount++;
        if (v === 'b') { api.gain(-30); Sfx.over(); }
        else if (v === 'g') { api.gain(50); Sfx.win(); }
        else { api.gain(10 + Math.random() < 0.2 ? 5 : 0); Sfx.eat(); }
        draw();
      });
    }
    draw();
    api.info('⏱ 30s');
    api._pop = setInterval(pop, 780);
    api._tick = setInterval(() => {
      if (over) return;
      timeLeft--;
      api.info(tf('⏱ {s}s · 命中 {n}', { s: timeLeft, n: hitCount }));
      if (timeLeft <= 0) { over = true; api.over(true, tf('命中 {n} 只', { n: hitCount })); }
    }, 1000);
    api.destroy = () => { clearInterval(api._pop); clearInterval(api._tick); };
  },
});
