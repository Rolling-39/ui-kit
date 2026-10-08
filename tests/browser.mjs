// ui-kit 前端行为验证：无头 Edge + CDP，11 条正向断言。
//
//   7 条行为断言：原生背景开关不被系统主题推翻、首面板 mount 挂死能兜底、
//                 首面板等待期被切走不泄漏、demo 事件走总线、键盘焦点是品牌色、
//                 .chip 可聚焦、提示条有 aria
//   4 条钩子断言：骨架齐全 / 缺 tbTitle 仍能启动 / 缺 tbMax 报错点名 / 缺两个都点名
//
// 不需要装 playwright 或 puppeteer：用系统自带的 Edge + Node 22 内置的 WebSocket。
// 用法：node tests/browser.mjs   （本地没有 Edge 时跳过，不算失败）
//
// 这几条都是"改之前真的坏过"的行为，所以它们同时是回归护栏。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 本地静态服务（指向仓库根）──
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
};
const server = createServer(async (req, res) => {
    let rel = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^[/\\]+/, '');
    // 目录 URL 要补 index.html —— `python -m http.server` 自带这个行为，
    // 自己实现静态服务时最容易漏，漏了就会让 /demo/ 这类地址 404。
    if (!rel || /[/\\]$/.test(rel)) rel += 'index.html';
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
    } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ── 找浏览器 ──
const EDGE_CANDIDATES = [
    process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/microsoft-edge',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);
const EDGE = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!EDGE) {
    console.log('未找到 Edge，跳过浏览器行为验证（可用 EDGE_PATH 指定路径）');
    server.close();
    process.exit(0);
}

const PORT = 9455 + Math.floor(Math.random() * 40);
const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${(process.env.TEMP || '/tmp')}/ui-kit-test-${Date.now()}`,
    '--window-size=1400,900',
    'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0, sessionId = null;
const pending = new Map();

function send(method, params = {}) {
    const id = ++msgId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        setTimeout(() => {
            if (pending.has(id)) { pending.delete(id); rej(new Error('CDP 超时: ' + method)); }
        }, 30000);
    });
}

async function waitForEndpoint() {
    for (let i = 0; i < 80; i++) {
        try {
            const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
            const j = await r.json();
            if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
        } catch { /* 未就绪 */ }
        await sleep(200);
    }
    throw new Error('调试端口未就绪');
}

async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) {
        throw new Error('页面内异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result?.value;
}

// 对比度计算（WCAG 2.x），供 P1-2 的断言用
const srgb = (u) => { u /= 255; return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
function parseRgba(s) {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { rgb: p.slice(0, 3), alpha: p.length > 3 ? p[3] : 1 };
}
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const rows = [];
function check(id, desc, ok, actual) {
    rows.push({ id, desc, ok });
    console.log(`  ${ok ? '[通过]' : '[失败]'} ${id} ${desc}`);
    console.log(`         ${actual}`);
}

async function goto(path, waitMs = 800) {
    await send('Page.navigate', { url: BASE + path });
    await sleep(waitMs);
}

async function pressTab(times) {
    for (let i = 0; i < times; i++) {
        for (const type of ['rawKeyDown', 'keyUp']) {
            await send('Input.dispatchKeyEvent', {
                type, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, code: 'Tab', key: 'Tab',
            });
        }
        await sleep(130);
    }
}

try {
    ws = new WebSocket(await waitForEndpoint());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id); pending.delete(m.id);
            m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
        }
    };
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    sessionId = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    await send('Page.enable');
    await send('Runtime.enable');

    // ── 行为断言 ──
    console.log('行为断言');

    // P0-1：useBackdrop:false 不能被系统切主题推翻
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await goto('/tests/probe.html?nobackdrop=1', 900);
    const before = await evaluate('document.documentElement.classList.contains("backdrop-ok")');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await sleep(600);
    const after = await evaluate('document.documentElement.classList.contains("backdrop-ok")');
    const calls = await evaluate('window.__probeCalls.filter(c => c.cmd === "ui_kit_apply_backdrop").length');
    check('P0-1', 'useBackdrop:false 不被系统切主题推翻',
        before === false && after === false,
        `切换前 backdrop-ok=${before}，切换后=${after}，apply_backdrop 被调用 ${calls} 次`);

    // P0-2：首面板 mount 挂死要有超时兜底
    await goto('/tests/probe.html?s=hang', 2600);
    const ready = await evaluate('window.__probe.ready');
    check('P0-2', '首面板 mount 挂死时 createShell 仍会返回',
        ready === true, `2.6s 后 __probe.ready = ${ready}`);

    // P0-3：首面板等待期被切走，handle 要回收
    await goto('/tests/probe.html?s=leak', 3200);
    const p1 = await evaluate('window.__probe');
    await sleep(1200);
    const ticks2 = await evaluate('window.__probe.ticks');
    check('P0-3', '被切走的首面板 destroy 会被调用、定时器停止',
        p1.kicks >= 1 && p1.destroyed === 1 && ticks2 <= p1.ticks,
        `切走 ${p1.kicks} 次，destroyed=${p1.destroyed}，定时器 ${p1.ticks} → ${ticks2}`);

    // P0-4：demo 按钮必须走事件总线
    await send('Emulation.setEmulatedMedia', { features: [] });
    await goto('/demo/', 1500);
    await evaluate('document.querySelector(\'.nav-item[data-panel="contract"]\').click()');
    await sleep(700);
    await evaluate(`[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('触发 demo-event')).click()`);
    await sleep(400);
    await evaluate('document.querySelector(\'.nav-item[data-panel="log"]\').click()');
    await sleep(700);
    const logText = await evaluate('document.getElementById("logArea") ? document.getElementById("logArea").textContent : ""');
    check('P0-4', 'demo 的「触发 demo-event」走了事件总线',
        logText.includes('收到 demo-event'),
        `日志含「收到 demo-event」= ${logText.includes('收到 demo-event')}`);

    // P1-9：键盘焦点是品牌色
    await evaluate('document.querySelector(\'.nav-item[data-panel="showcase"]\').click()');
    await sleep(600);
    await evaluate('document.body.focus()');
    await pressTab(3);
    const focus = await evaluate(`(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return { none: true };
        const s = getComputedStyle(a);
        return { tag: a.tagName, color: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle };
    })()`);
    const brand = !!focus.color && /57,\s*197,\s*187|74,\s*218,\s*208/.test(focus.color);
    check('P1-9', 'Tab 聚焦显示品牌色焦点圈',
        !focus.none && brand,
        focus.none ? 'Tab 后焦点仍在 body' : `<${String(focus.tag).toLowerCase()}> ${focus.style} ${focus.width} ${focus.color}`);

    // P2-9：.chip 可聚焦
    const chip = await evaluate(`(() => {
        const c = document.querySelector('.chip');
        return c ? { tag: c.tagName, tabIndex: c.tabIndex } : null;
    })()`);
    check('P2-9', '.chip 用可聚焦元素承载',
        !!chip && chip.tag !== 'SPAN' && chip.tabIndex >= 0,
        chip ? `<${chip.tag.toLowerCase()}> tabIndex=${chip.tabIndex}` : '页面上没有 .chip');

    // P2-11：snackbar 有 role
    await evaluate('document.querySelector(\'.nav-item[data-panel="log"]\').click()');
    await sleep(500);
    await evaluate(`[...document.querySelectorAll('.btn')].find(b => b.textContent.trim() === '清空').click()`);
    await sleep(250);
    const snack = await evaluate(`(() => {
        const s = document.querySelector('.snackbar');
        return s ? { role: s.getAttribute('role'), live: s.getAttribute('aria-live') } : null;
    })()`);
    check('P2-11', 'snackbar 带 role 与 aria-live',
        !!snack && !!snack.role && !!snack.live,
        snack ? `role=${snack.role}, aria-live=${snack.live}` : '未捕获到 snackbar');

    // P1-2：语义色与色块之上的文字，两个档位都要 >= 4.5:1。
    // 读的是**真实渲染出来的 computed style**，不是源码里的字面值 ——
    // 变量有没有正确级联、锁定块有没有覆盖全，只有这一步能证明。
    for (const scheme of ['light', 'dark']) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
        await goto('/tests/probe.html', 700);

        const pairs = await evaluate(`(() => {
            const mk = (cls) => { const d = document.createElement('div'); d.className = cls; document.body.appendChild(d); return d; };
            const pick = (e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.color]; };
            const b = mk('btn btn-danger');
            const s = mk('snackbar warn');
            const out = { 按钮: pick(b), 提示条: pick(s) };
            b.remove(); s.remove();
            return out;
        })()`);

        // 标题栏关闭按钮的 hover 态也用语义色底 —— 它不是常驻可见的，
        // 光靠"创建元素读样式"测不到，得用真实鼠标移动触发 :hover。
        // （试过 CSS.forcePseudoState，在这个版本上读到的仍是未 hover 的样式。）
        const box = await evaluate(`(() => {
            const e = document.querySelector('.tb-close');
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()`);
        if (box) {
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
            await sleep(150);
            pairs['关闭钮hover'] = await evaluate(
                `(() => { const c = getComputedStyle(document.querySelector('.tb-close')); return [c.backgroundColor, c.color]; })()`);
        }

        let ok = true;
        const detail = [];
        for (const [name, [bg, fg]] of Object.entries(pairs)) {
            const pb = parseRgba(bg), pf = parseRgba(fg);
            // 背景透明说明这条规则根本没生效，不能按"黑色背景"算过去 ——
            // rgba(0, 0, 0, 0) 的前三位是 0，当黑底配白字会算出 21:1 的假通过。
            if (!pb || !pf || pb.alpha === 0) {
                detail.push(`${name} 背景透明（规则未生效）`);
                ok = false;
                continue;
            }
            const r = contrast(pb.rgb, pf.rgb);
            detail.push(`${name} ${r.toFixed(2)}`);
            if (r < 4.5) ok = false;
        }
        check(`P1-2-${scheme}`, `${scheme} 档语义色对比度全部 >= 4.5`,
            ok, detail.join('，'));
    }
    await send('Emulation.setEmulatedMedia', { features: [] });

    // ── 钩子断言 ──
    console.log();
    console.log('骨架钩子断言');

    await goto('/tests/probe.html', 900);
    const all = await evaluate('window.__probe');
    check('钩子-1', '钩子齐全时正常启动', !!all && all.ok === true,
        `ok=${all?.ok} err=${all?.err ?? 'null'}`);

    await goto('/tests/probe.html?skip=tbTitle', 900);
    const noTitle = await evaluate('window.__probe');
    check('钩子-2', '缺 tbTitle（可选钩子）仍能启动', !!noTitle && noTitle.ok === true,
        `ok=${noTitle?.ok} err=${noTitle?.err ?? 'null'}`);

    await goto('/tests/probe.html?skip=tbMax', 900);
    const noMax = await evaluate('window.__probe');
    check('钩子-3', '缺 tbMax 抛错且点名', !!noMax && noMax.ok === false && /#tbMax/.test(String(noMax.err)),
        `ok=${noMax?.ok} err=${JSON.stringify(noMax?.err)}`);

    await goto('/tests/probe.html?skip=sidebarNav,content', 900);
    const noTwo = await evaluate('window.__probe');
    check('钩子-4', '缺多个时逐个点名',
        !!noTwo && noTwo.ok === false && /#sidebarNav/.test(String(noTwo.err)) && /#content/.test(String(noTwo.err)),
        `ok=${noTwo?.ok} err=${JSON.stringify(noTwo?.err)}`);

    const failed = rows.filter((r) => !r.ok);
    console.log();
    console.log(`共 ${rows.length} 条断言，失败 ${failed.length} 条`);
    if (failed.length) {
        for (const f of failed) console.log(`  失败：${f.id} ${f.desc}`);
        process.exitCode = 1;
    }
} catch (e) {
    console.error('行为验证出错：', e.message);
    process.exitCode = 2;
} finally {
    try { ws && ws.close(); } catch { /* ignore */ }
    edge.kill();
    server.close();
}
