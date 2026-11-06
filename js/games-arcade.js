/* ============================================================
   芒果游戏盒 · Canvas 动作游戏
   贪吃蛇 / 打砖块 / 弹球对战 / 芒果大作战 / 接芒果
   ============================================================ */
'use strict';

/* ---------- 通用画布助手 ---------- */
function makeGameCanvas(api, W, H) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  cv.className = 'g-canvas';
  cv.style.aspectRatio = W + ' / ' + H;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  api.root.appendChild(cv);
  /* 逻辑坐标换算（CSS 缩放后） */
  const toXY = (clientX, clientY) => {
    const r = cv.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
  };
  const clear = (bg = '#0a1f3c') => { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); };
  return { cv, ctx, W, H, toXY, clear };
}
function rr(ctx, x, y, w, h, r) { // 圆角矩形
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============================================================
   1. 贪吃蛇
   ============================================================ */
Games.register({
  id: 'snake', name: '贪吃蛇', desc: '越吃越长，别撞墙', icon: '🐍', play: '滑动或方向键控制',
  grad: 'linear-gradient(135deg,#7fe3a0,#1f9d55)',
  mount(api) {
    api.tick = tick;   // 主循环钩子（函数声明提升，此处已可用）
    const N = 15, CELL = 24, W = N * CELL, H = N * CELL;
    const { cv, ctx, clear } = makeGameCanvas(api, W, H);
    let snake = [{ x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }];
    let dir = { x: 1, y: 0 }, next = dir, food = rndFood(), bonus = null, bonusT = 0;
    let acc = 0, speed = 150, moveAcc = 0;
    function rndFood() {
      let p;
      do { p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; }
      while (snake.some(s => s.x === p.x && s.y === p.y));
      return p;
    }
    const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    api.onKey = (e, down) => {
      if (!down) return;
      const k = keys[e.key]; if (!k) return;
      if (k[0] === -dir.x && k[1] === -dir.y) return; // 禁止反向
      next = { x: k[0], y: k[1] };
    };
    api.onSwipe = (d) => {
      const m = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
      if (m && !(m[0] === -dir.x && m[1] === -dir.y)) next = { x: m[0], y: m[1] };
    };
    makePad(api.root, [
      { label: '◀', fn: () => { if (dir.x !== 1) next = { x: -1, y: 0 }; } },
      { label: '▼', fn: () => { if (dir.y !== -1) next = { x: 0, y: 1 }; } },
      { label: '▲', fn: () => { if (dir.y !== 1) next = { x: 0, y: -1 }; } },
      { label: '▶', fn: () => { if (dir.x !== -1) next = { x: 1, y: 0 }; } },
    ]);
    function tick(d) {
      const dt = api.dt(d);
      moveAcc += dt;
      const inv = api.admin.isOn() && api.admin.invincible;
      if (bonus) { bonusT -= dt; if (bonusT <= 0) bonus = null; }
      if (moveAcc >= speed) {
        moveAcc = 0;
        dir = next;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        const hitWall = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N;
        const hitSelf = snake.some(s => s.x === head.x && s.y === head.y);
        if ((hitWall || hitSelf) && !inv) { api.over(false, tf('长度 {n}', { n: snake.length })); return; }
        if (hitWall) { /* 无敌：穿墙 */
          head.x = (head.x + N) % N; head.y = (head.y + N) % N;
          if (snake.some(s => s.x === head.x && s.y === head.y)) { api.over(false, tf('长度 {n}', { n: snake.length })); return; }
        }
        snake.unshift(head);
        let ate = false;
        if (head.x === food.x && head.y === food.y) {
          ate = true; api.gain(10); Sfx.eat(); food = rndFood();
          speed = Math.max(70, speed - 3);
          if (snake.length % 5 === 0 && !bonus) { bonus = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; bonusT = 6000; }
        }
        if (bonus && head.x === bonus.x && head.y === bonus.y) { ate = true; bonus = null; api.gain(50); Sfx.win(); }
        if (!ate) snake.pop();
        if (snake.length >= 40) { api.over(true, tf('长度 {n} · 满级芒果蛇！', { n: snake.length })); return; }
      }
      // 绘制
      clear('#0a1f3c');
      ctx.strokeStyle = 'rgba(255,255,255,.04)';
      for (let i = 1; i < N; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL); ctx.stroke();
      }
      // 食物
      ctx.font = `${CELL - 6}px serif`;
      ctx.fillText('🥭', food.x * CELL + 2, food.y * CELL + CELL - 3);
      if (bonus) { ctx.globalAlpha = bonusT < 1500 ? 0.4 + 0.6 * Math.abs(Math.sin(bonusT / 120)) : 1; ctx.fillText('⭐', bonus.x * CELL + 2, bonus.y * CELL + CELL - 3); ctx.globalAlpha = 1; }
      // 蛇
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#ffd75e' : `hsl(${100 + i * 4},70%,${i % 2 ? 46 : 54}%)`;
        rr(ctx, s.x * CELL + 1.5, s.y * CELL + 1.5, CELL - 3, CELL - 3, 6);
        ctx.fill();
        if (i === 0) { ctx.font = '13px serif'; ctx.fillText('👑', s.x * CELL + 5, s.y * CELL + CELL - 6); }
      });
      if (inv) { ctx.fillStyle = 'rgba(255,215,94,.9)'; ctx.font = '12px sans-serif'; ctx.fillText(t('🛡 无敌'), 8, 18); }
    }
  },
});

/* ============================================================
   2. 打砖块
   ============================================================ */
Games.register({
  id: 'brick', name: '打砖块', desc: '弹球击碎所有砖块', icon: '🧱', play: '鼠标 / 触屏移动挡板',
  grad: 'linear-gradient(135deg,#ff9d7e,#e34b2e)',
  mount(api) {
    api.tick = tick;
    const W = 360, H = 480;
    const { ctx, toXY, clear } = makeGameCanvas(api, W, H);
    const COLS = 7, ROWS = 5, BW = 44, BH = 18, GAP = 6, OFFY = 60;
    let paddle = { x: W / 2 - 40, w: 80, h: 12 };
    let ball = { x: W / 2, y: H - 60, r: 7, vx: 3, vy: -3.4 };
    let bricks = [], lives = 3, level = 1, launched = false;
    const COLORS = ['#ff6b6b', '#ffa94d', '#ffd75e', '#7fe3a0', '#74c0fc'];
    function build() {
      bricks = [];
      const ox = (W - (COLS * (BW + GAP) - GAP)) / 2;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
        bricks.push({ x: ox + c * (BW + GAP), y: OFFY + r * (BH + GAP), c: COLORS[r % COLORS.length], hp: r === 0 ? 2 : 1, alive: true });
    }
    build();
    let drag = false;
    const move = (cx) => { const p = toXY(cx, 0); paddle.x = Math.max(0, Math.min(W - paddle.w, p.x - paddle.w / 2)); };
    api._cv = api.root.querySelector('canvas');
    const onUp = () => { drag = false; };
    api._cv.addEventListener('mousedown', () => { drag = true; if (!launched) launched = true; });
    window.addEventListener('mouseup', onUp);
    api._cv.addEventListener('mousemove', (e) => { if (drag || !isTouch) move(e.clientX); });
    api._cv.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0].clientX); }, { passive: false });
    api._cv.addEventListener('touchstart', (e) => { e.preventDefault(); move(e.touches[0].clientX); if (!launched) launched = true; }, { passive: false });
    api.onKey = (e, down) => {
      if (!down) return;
      if (e.key === 'ArrowLeft') paddle.x = Math.max(0, paddle.x - 28);
      if (e.key === 'ArrowRight') paddle.x = Math.min(W - paddle.w, paddle.x + 28);
      if (e.key === ' ' && !launched) launched = true;
    };
    function resetBall() {
      ball = { x: paddle.x + paddle.w / 2, y: H - 60, r: 7, vx: 3 * (Math.random() > 0.5 ? 1 : -1), vy: -3.4 };
      launched = false;
    }
    function tick(d) {
      const dt = api.dt(d), f = dt / 16.7;
      const inv = api.admin.isOn() && api.admin.invincible;
      if (!launched) { ball.x = paddle.x + paddle.w / 2; ball.y = H - 40; }
      else {
        ball.x += ball.vx * f; ball.y += ball.vy * f;
        if (ball.x < ball.r) { ball.x = ball.r; ball.vx *= -1; Sfx.hit(); }
        if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx *= -1; Sfx.hit(); }
        if (ball.y < ball.r) { ball.y = ball.r; ball.vy *= -1; Sfx.hit(); }
        // 挡板
        if (ball.y + ball.r > H - 30 && ball.y - ball.r < H - 18 && ball.x > paddle.x - ball.r && ball.x < paddle.x + paddle.w + ball.r && ball.vy > 0) {
          ball.vy = -Math.abs(ball.vy);
          const off = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          ball.vx = off * 4;
          Sfx.eat();
        }
        // 砖块
        for (const b of bricks) {
          if (!b.alive) continue;
          if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + BW && ball.y + ball.r > b.y && ball.y - ball.r < b.y + BH) {
            b.hp--; ball.vy *= -1; Sfx.hit();
            if (b.hp <= 0) { b.alive = false; api.gain(10); }
            break;
          }
        }
        // 底边
        if (ball.y > H + 20) {
          if (inv) { ball.y = H - 40; ball.vy = -3.4; }
          else { lives--; Sfx.over(); if (lives <= 0) { api.over(false, tf('击碎 {n} 块', { n: bricks.filter(b => !b.alive).length })); return; } resetBall(); }
        }
        if (bricks.every(b => !b.alive)) {
          level++; api.gain(100); Sfx.win();
          if (level > 3) { api.over(true, t('全部通关！')); return; }
          build(); resetBall();
        }
      }
      api.info(tf('❤ {h} · 第 {n} 关', { h: '♥'.repeat(Math.max(0, lives)), n: level }));
      // 绘制
      clear('#0a1f3c');
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, OFFY - 20 + i * 78, W, 1);
      bricks.forEach(b => { if (!b.alive) return; ctx.fillStyle = b.hp > 1 ? '#fff' : b.c; rr(ctx, b.x, b.y, BW, BH, 5); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(b.x + 3, b.y + BH - 6, BW - 6, 3); });
      ctx.fillStyle = '#ffd75e';
      rr(ctx, paddle.x, H - 30, paddle.w, paddle.h, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
      if (!launched) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t('点击 / 按空格 发球'), W / 2, H - 60); ctx.textAlign = 'left'; }
      if (inv) { ctx.fillStyle = 'rgba(255,215,94,.9)'; ctx.font = '12px sans-serif'; ctx.fillText(t('🛡 无敌'), 8, 18); }
    }
    api.destroy = () => window.removeEventListener('mouseup', onUp);
  },
});

/* ============================================================
   3. 弹球对战（人机乒乓）
   ============================================================ */
Games.register({
  id: 'pong', name: '弹球对战', desc: '和电脑打乒乓球', icon: '🏓', play: '鼠标 / 触屏 / 上下键移动',
  grad: 'linear-gradient(135deg,#74c0fc,#4dabf7)',
  mount(api) {
    api.tick = tick;
    const W = 360, H = 480;
    const { ctx, toXY, clear } = makeGameCanvas(api, W, H);
    let py = H / 2 - 40, ph = 80;
    let ay = H / 2 - 40, ah = 80;
    let bx = W / 2, by = H / 2, vx = 4, vy = 2.6, r = 8;
    let me = 0, cpu = 0, aiSpeed = 3.4;
    const cv = api.root.querySelector('canvas');
    const move = (cy) => { py = Math.max(0, Math.min(H - ph, toXY(0, cy).y - ph / 2)); };
    let drag = false;
    const onUp = () => { drag = false; };
    cv.addEventListener('mousedown', () => drag = true);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('mousemove', (e) => { if (drag || !isTouch) move(e.clientY); });
    cv.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0].clientY); }, { passive: false });
    api.onKey = (e, down) => {
      if (!down) return;
      if (e.key === 'ArrowUp') py = Math.max(0, py - 30);
      if (e.key === 'ArrowDown') py = Math.min(H - ph, py + 30);
    };
    function serve() { bx = W / 2; by = H / 2; vx = (Math.random() > 0.5 ? 1 : -1) * 4.2; vy = (Math.random() - 0.5) * 4; }
    function tick(d) {
      const dt = api.dt(d), f = dt / 16.7;
      const admin = api.admin.isOn();
      const spd = admin ? aiSpeed * 0.55 : aiSpeed; // 外挂：电脑变慢
      // AI
      const target = by - ah / 2;
      ay += Math.max(-spd * f, Math.min(spd * f, target - ay));
      // 球
      bx += vx * f; by += vy * f;
      if (by < r) { by = r; vy *= -1; Sfx.hit(); }
      if (by > H - r) { by = H - r; vy *= -1; Sfx.hit(); }
      if (bx < 22 + r && bx > 10 && by > py && by < py + ph && vx < 0) {
        vx = Math.abs(vx) * 1.06; vy = (by - (py + ph / 2)) / (ph / 2) * 4.2; Sfx.eat();
      }
      if (bx > W - 22 - r && bx < W - 10 && by > ay && by < ay + ah && vx > 0) {
        vx = -Math.abs(vx) * 1.06; vy = (by - (ay + ah / 2)) / (ah / 2) * 4.2; Sfx.hit();
      }
      if (bx < -20) { cpu++; api.gain(0); Sfx.over(); if (cpu >= 7) { api.over(false, tf('比分 {a} : {b}', { a: me, b: cpu })); return; } serve(); }
      if (bx > W + 20) { me++; api.gain(10); Sfx.win(); if (me >= 7) { api.over(true, tf('比分 {a} : {b} · 你赢了！', { a: me, b: cpu })); return; } serve(); }
      api.info(tf('你 {a} : {b} 电脑', { a: me, b: cpu }));
      // 绘制
      clear('#0a1f3c');
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd75e'; rr(ctx, 10, py, 12, ph, 6); ctx.fill();
      ctx.fillStyle = '#8ecdf8'; rr(ctx, W - 22, ay, 12, ah, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 15px sans-serif';
      ctx.fillText(me, 30, 28); ctx.fillText(cpu, W - 44, 28);
      if (admin) { ctx.fillStyle = 'rgba(255,215,94,.9)'; ctx.font = '12px sans-serif'; ctx.fillText(t('⚡ 电脑减速'), 8, 44); }
    }
    api.destroy = () => window.removeEventListener('mouseup', onUp);
  },
});

/* ============================================================
   4. 芒果大作战（飞行射击）
   ============================================================ */
Games.register({
  id: 'shooter', name: '芒果大作战', desc: '飞行射击守家', icon: '🚀', play: '触屏 / 鼠标移动，自动开火',
  grad: 'linear-gradient(135deg,#b197fc,#7048e8)',
  mount(api) {
    api.tick = tick;
    const W = 360, H = 480;
    const { ctx, toXY, clear } = makeGameCanvas(api, W, H);
    let ship = { x: W / 2, y: H - 70, w: 34, h: 30 };
    let bullets = [], enemies = [], parts = [], drops = [];
    let lives = 3, fireAcc = 0, spawnAcc = 0, wave = 1, killed = 0;
    const cv = api.root.querySelector('canvas');
    const move = (cx) => { ship.x = Math.max(ship.w / 2, Math.min(W - ship.w / 2, toXY(cx, 0).x)); };
    cv.addEventListener('mousemove', (e) => move(e.clientX));
    cv.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0].clientX); }, { passive: false });
    api.onKey = (e, down) => {
      if (!down) return;
      if (e.key === 'ArrowLeft') ship.x = Math.max(ship.w / 2, ship.x - 24);
      if (e.key === 'ArrowRight') ship.x = Math.min(W - ship.w / 2, ship.x + 24);
    };
    function spawn() {
      const big = Math.random() < 0.15;
      enemies.push({ x: 30 + Math.random() * (W - 60), y: -30, r: big ? 20 : 13, hp: big ? 3 : 1, vy: (big ? 0.9 : 1.4) + wave * 0.12, big });
    }
    function boom(x, y, c) { for (let i = 0; i < 10; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 26, c }); }
    function tick(d) {
      const dt = api.dt(d), f = dt / 16.7;
      const admin = api.admin.isOn(), inv = admin && api.admin.invincible;
      // 开火
      fireAcc += dt;
      const rate = admin ? 130 : 230;
      if (fireAcc >= rate) {
        fireAcc = 0;
        bullets.push({ x: ship.x, y: ship.y - 18, vy: -7 });
        if (admin) { bullets.push({ x: ship.x - 14, y: ship.y - 12, vy: -7 }); bullets.push({ x: ship.x + 14, y: ship.y - 12, vy: -7 }); }
        Sfx.click();
      }
      // 敌机
      spawnAcc += dt;
      if (spawnAcc >= Math.max(420, 1100 - wave * 90)) { spawnAcc = 0; spawn(); }
      bullets.forEach(b => b.y += b.vy * f);
      bullets = bullets.filter(b => b.y > -20);
      enemies.forEach(e => { e.y += e.vy * f; e.x += Math.sin(e.y / 40) * 0.8; });
      // 碰撞
      for (const b of bullets) {
        for (const e of enemies) {
          if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
            e.hp--; b.y = -99; boom(b.x, b.y, '#ffd75e'); Sfx.hit();
            if (e.hp <= 0) { killed++; api.gain(e.big ? 30 : 10); boom(e.x, e.y, '#ff9d7e'); if (Math.random() < 0.25) drops.push({ x: e.x, y: e.y, vy: 2 }); }
          }
        }
      }
      enemies = enemies.filter(e => e.hp > 0 && e.y < H + 40);
      drops.forEach(p => p.y += p.vy * f);
      drops = drops.filter(p => p.y < H + 20);
      // 掉血 / 吃补给
      if (!inv) {
        for (const e of enemies) if (Math.hypot(e.x - ship.x, e.y - ship.y) < e.r + 16) { e.hp = 0; lives--; boom(ship.x, ship.y, '#ff6b6b'); Sfx.over(); }
      } else enemies.forEach(e => { if (Math.hypot(e.x - ship.x, e.y - ship.y) < e.r + 16) { e.hp = 0; api.gain(10); } });
      drops.forEach((p, i) => { if (Math.hypot(p.x - ship.x, p.y - ship.y) < 22) { drops.splice(i, 1); if (lives < 3) lives++; else api.gain(20); Sfx.win(); } });
      if (lives <= 0) { api.over(false, tf('击落 {n} 架', { n: killed })); return; }
      if (killed >= wave * 12) { wave++; api.gain(50); Sfx.win(); }
      api.info(tf('❤ {h} · 第 {n} 波', { h: '♥'.repeat(lives), n: wave }));
      parts.forEach(p => { p.x += p.vx * f; p.y += p.vy * f; p.life -= f; });
      parts = parts.filter(p => p.life > 0);
      // 绘制
      clear('#0a1f3c');
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 12; i++) ctx.fillRect((i * 97) % W, (i * 61 + (Date.now() / 9 % 60)) % H, 2, 2);
      bullets.forEach(b => { ctx.fillStyle = '#ffe066'; ctx.fillRect(b.x - 2, b.y - 8, 4, 12); });
      drops.forEach(p => { ctx.font = '18px serif'; ctx.fillText('❤', p.x - 9, p.y + 6); });
      enemies.forEach(e => {
        ctx.font = (e.r * 1.7) + 'px serif'; ctx.textAlign = 'center';
        ctx.fillText(e.big ? '👾' : '🛸', e.x, e.y + e.r * 0.6);
        ctx.textAlign = 'left';
      });
      parts.forEach(p => { ctx.globalAlpha = p.life / 26; ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); ctx.globalAlpha = 1; });
      // 飞船
      ctx.font = '30px serif'; ctx.textAlign = 'center';
      ctx.fillText('🥭', ship.x, ship.y + 10);
      ctx.font = '14px serif'; ctx.fillText('🔥', ship.x - 16, ship.y - 10); ctx.fillText('🔥', ship.x + 16, ship.y - 10);
      ctx.textAlign = 'left';
      if (inv) { ctx.fillStyle = 'rgba(255,215,94,.9)'; ctx.font = '12px sans-serif'; ctx.fillText(t('🛡 无敌'), 8, 18); }
    }
  },
});

/* ============================================================
   5. 接芒果
   ============================================================ */
Games.register({
  id: 'catcher', name: '接芒果', desc: '天降芒果接满筐', icon: '🧺', play: '触屏 / 鼠标 / 左右键移动篮子',
  grad: 'linear-gradient(135deg,#ffc9c9,#e8890c)',
  mount(api) {
    api.tick = tick;
    const W = 360, H = 480;
    const { ctx, toXY, clear } = makeGameCanvas(api, W, H);
    let basket = { x: W / 2, y: H - 56, w: 64 };
    let items = [], lives = 3, t = 0, combo = 0, spawnAcc = 0;
    const cv = api.root.querySelector('canvas');
    const move = (cx) => { basket.x = Math.max(basket.w / 2, Math.min(W - basket.w / 2, toXY(cx, 0).x)); };
    cv.addEventListener('mousemove', (e) => move(e.clientX));
    cv.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0].clientX); }, { passive: false });
    api.onKey = (e, down) => {
      if (!down) return;
      if (e.key === 'ArrowLeft') basket.x = Math.max(basket.w / 2, basket.x - 26);
      if (e.key === 'ArrowRight') basket.x = Math.min(W - basket.w / 2, basket.x + 26);
    };
    function spawn() {
      const r = Math.random();
      items.push({ x: 24 + Math.random() * (W - 48), y: -20, vy: 2.2 + Math.random() * 1.4 + t / 900, type: r < 0.72 ? 'mango' : r < 0.86 ? 'gold' : 'bomb' });
    }
    let timeLeft = 60;
    function tick(d) {
      const dt = api.dt(d), f = dt / 16.7;
      t += dt; timeLeft -= dt / 1000;
      const admin = api.admin.isOn(), inv = admin && api.admin.invincible;
      spawnAcc += dt;
      if (spawnAcc >= Math.max(300, 640 - t / 120)) { spawnAcc = 0; spawn(); }
      items.forEach(p => p.y += p.vy * f);
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        if (p.y > H + 24) { items.splice(i, 1); if (p.type !== 'bomb') { combo = 0; } continue; }
        if (Math.abs(p.x - basket.x) < basket.w / 2 + 8 && p.y > basket.y - 16 && p.y < basket.y + 20) {
          items.splice(i, 1);
          if (p.type === 'bomb') {
            if (inv) { api.gain(5); }
            else { lives--; combo = 0; Sfx.over(); if (lives <= 0) { api.over(false, tf('得分 {n}', { n: Math.round(api.getScore()) })); return; } }
          } else if (p.type === 'gold') { api.gain(30); combo++; Sfx.win(); }
          else { api.gain(10 + Math.min(combo, 10) * 2); combo++; Sfx.eat(); }
        }
      }
      if (timeLeft <= 0) { api.over(true, tf('剩余生命 {n}', { n: lives })); return; }
      api.info(tf('⏱ {s}s · ❤ {l} · 连击 {c}', { s: Math.ceil(timeLeft), l: lives, c: combo }));
      // 绘制
      clear('#0a1f3c');
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = 0; i < 8; i++) ctx.fillRect((i * 53 + 13) % W, (i * 89 + (t / 12) % H) % H, 2, 2);
      items.forEach(p => {
        ctx.font = '26px serif'; ctx.textAlign = 'center';
        ctx.fillText(p.type === 'bomb' ? '💣' : p.type === 'gold' ? '⭐' : '🥭', p.x, p.y);
        ctx.textAlign = 'left';
      });
      // 篮子
      ctx.fillStyle = '#c98f3c';
      rr(ctx, basket.x - basket.w / 2, basket.y, basket.w, 26, 8); ctx.fill();
      ctx.fillStyle = '#a8712c';
      rr(ctx, basket.x - basket.w / 2 + 4, basket.y + 20, basket.w - 8, 10, 5); ctx.fill();
      ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.fillText('🥭', basket.x, basket.y + 18); ctx.textAlign = 'left';
      if (inv) { ctx.fillStyle = 'rgba(255,215,94,.9)'; ctx.font = '12px sans-serif'; ctx.fillText(t('🛡 无敌'), 8, 18); }
    }
  },
});
