// 公開用のフォルダ dist/ を作る（静的ホスティングにそのまま置ける）
//   node tools/build.mjs
// ・オフライン用のファイル一覧 precache.js を作り直す（内容が変わると版が変わり、端末の保存も更新される）
// ・開発用のファイル（server.js・tools・docs など）は入れない
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'dist');
const ENTRIES = ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'icons', 'src', 'vendor'];

function walk(p, out) {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f), out);
  else out.push(p);
  return out;
}

const files = ENTRIES.flatMap((e) => walk(join(ROOT, e), [])).filter((f) => !f.endsWith('LICENSE') || f.includes('vendor'));
const hash = createHash('sha256');
for (const f of files.sort()) { hash.update(relative(ROOT, f)); hash.update(readFileSync(f)); }
const version = hash.digest('hex').slice(0, 12);

// サービスワーカー自身は一覧に入れない（ブラウザが別に管理する）
const list = ['./', ...files.map((f) => './' + relative(ROOT, f).split(sep).join('/')).filter((u) => u !== './sw.js')];
const precache = `// node tools/build.mjs が作るファイル（手で編集しない）\nself.VERSION = '${version}';\nself.PRECACHE = ${JSON.stringify(list, null, 2)};\n`;
writeFileSync(join(ROOT, 'precache.js'), precache);

// フォルダごと消すと、開いているサーバーなどがあると失敗するので中身だけ消す
if (existsSync(DIST)) for (const f of readdirSync(DIST)) rmSync(join(DIST, f), { recursive: true, force: true });
else mkdirSync(DIST);
for (const e of [...ENTRIES, 'precache.js']) cpSync(join(ROOT, e), join(DIST, e), { recursive: true });
// タイトル画面に出す版（package.json の version と、公開したコミット・日付）
{
  const { version: appVersion } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  let sha = (process.env.GITHUB_SHA || '').slice(0, 7);
  if (!sha) { try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { sha = 'local'; } }
  const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本時間の日付
  const v = readFileSync(join(ROOT, 'src', 'version.js'), 'utf8')
    .replace(/export const VERSION = '[^']*';/, `export const VERSION = '${appVersion}';`)
    .replace(/export const BUILD = '[^']*';/, `export const BUILD = '${sha}・${date}';`);
  writeFileSync(join(DIST, 'src', 'version.js'), v);
}

// Quest 用 APK（Bubblewrap）の持ち主確認ファイル。サイトの直下 /.well-known/assetlinks.json に置く
if (existsSync(join(ROOT, '.well-known'))) cpSync(join(ROOT, '.well-known'), join(DIST, '.well-known'), { recursive: true });
// GitHub Pages などで _ や . で始まるファイルを無視させない
writeFileSync(join(DIST, '.nojekyll'), '');

const size = walk(DIST, []).reduce((s, f) => s + statSync(f).size, 0);
console.log(`dist/ を作りました（${list.length} ファイル、${(size / 1024 / 1024).toFixed(1)} MB、版 ${version}）`);
