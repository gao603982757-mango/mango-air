/* 构建脚本：把多文件源码打包为单文件 HTML（发布到云端用）
 * 原因：发布平台的 WAF 会拦截 .js 直连请求（403），单文件版无外部 JS 引用，可彻底规避。
 * 用法：node build.js  →  生成 dist/index.html
 * 本地源码（css/ js/ index.html）保持多文件结构，方便维护；发布用 dist 单文件版。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

let html = read('index.html');

// 1) 内联 CSS（保持媒体查询与变量，直接替换 <link rel="stylesheet">）
const css = read('css/style.css');
html = html.replace(
  /<link rel="stylesheet" href="css\/style\.css[^"]*">/,
  () => '<style>\n' + css + '\n</style>'
);

// 2) 按原顺序内联 JS（i18n → api → data → games* → app）
const jsFiles = ['js/i18n.js', 'js/api.js', 'js/data.js', 'js/games-core.js', 'js/games-arcade.js', 'js/games-puzzle.js', 'js/games-board.js', 'js/service.js', 'js/app.js'];
let scripts = jsFiles.map(read).join('\n;\n');
// 防御：JS 中出现 </script> 会破坏 HTML 结构，转义处理
scripts = scripts.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script src="js\/[^"]+"><\/script>\s*/g, '');
// 在 </body> 前注入合并后的 JS
html = html.replace('</body>', () => '<script>\n' + scripts + '\n</script>\n</body>');

// 4) 图片 base64 内联（云端门禁会拦截不带 sharecode 的图片请求，必须自包含）
//    去重策略：每张图只在 HTML 中保留一份真实 data URI，其余引用替换为占位符
//    data:__img:<key>,（尾部逗号使其成为合法 data URL，避免浏览器报 ERR_INVALID_URL），
//    再由注入的修复脚本（启动时 + MutationObserver）替换为真实 data URI，
//    避免同一张大图（如 Logo 178KB）被内联 5 次导致体积膨胀。
const fs2 = fs;
const assetsDir = path.join(ROOT, 'assets');
const mimeOf = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
const IMG_KEYS = { 'mango-logo.png': 'logo', 'alliance-logo.png': 'alliance', 'slogan.png': 'slogan', 'plane.jpg': 'plane', 'mango-hero.jpg': 'hero' };
const imgMap = {};
const refs = [];
for (const file of fs2.readdirSync(assetsDir)) {
  const ext = file.split('.').pop().toLowerCase();
  if (!mimeOf[ext]) continue;
  const key = IMG_KEYS[file];
  if (!key) continue;
  const buf = fs2.readFileSync(path.join(assetsDir, file));
  imgMap[key] = `data:${mimeOf[ext]};base64,${buf.toString('base64')}`;
  const ref = 'assets/' + file;
  if (html.includes(ref)) refs.push({ ref, key, placeholder: `data:__img:${key},`, uri: imgMap[key], bytes: buf.length });
}
// 第一阶段：所有引用 → 占位符（此时 HTML 中无 data URI，避免 base64 内容干扰匹配）
let dedupSaved = 0;
for (const r of refs) {
  const n = html.split(r.ref).length - 1;
  dedupSaved += (r.bytes * 4 / 3) * (n - 1);
  html = html.split(r.ref).join(r.placeholder);
}
// 第二阶段：每张图的第一个占位符 → 真实 data URI（只替换一次，base64 不再参与匹配）
for (const r of refs) html = html.replace(r.placeholder, () => r.uri);
const imgCount = refs.length;
const imgBytes = refs.reduce((s, r) => s + r.bytes, 0);

// 注入图片修复脚本（处理占位符引用，含动态渲染的节点）
const fixScript = `<script>(function(){var MAP=${JSON.stringify(imgMap)};var P='data:__img:';function fixImg(img){var s=img.getAttribute('src')||'';if(s.indexOf(P)===0){var k=s.slice(P.length).replace(/,$/,'');if(MAP[k])img.src=MAP[k];}}function fix(root){var q=(root||document).querySelectorAll('img[src^="'+P+'"]');for(var i=0;i<q.length;i++)fixImg(q[i]);}fix(document);if(window.MutationObserver){new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var ns=ms[i].addedNodes;for(var j=0;j<ns.length;j++){var n=ns[j];if(n.nodeType===1){if(n.tagName==='IMG')fixImg(n);fix(n);}}}}).observe(document.documentElement,{childList:true,subtree:true});}})();</script>`;
html = html.replace('<script>\n', () => fixScript + '\n<script>\n');

const distDir = path.join(ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf-8');

const kb = (n) => (n / 1024).toFixed(1) + 'KB';
console.log('✅ 构建完成: dist/index.html (' + kb(fs.statSync(path.join(distDir, 'index.html')).size) + ')');
console.log('   CSS ' + kb(css.length) + ' + JS ' + kb(scripts.length) + ' 已全部内联');
console.log('   图片 ' + imgCount + ' 个已 base64 内联（去重后节省约 ' + kb(dedupSaved) + '）');
console.log('   单文件完全自包含，无任何外部请求（规避云端门禁对外链资源的拦截）');
