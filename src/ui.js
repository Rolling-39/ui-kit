// ─────────────────────────────────────────────────────────────
// ui-kit / ui.js —— 通用 UI 工具：日志、提示条、DOM 构造、格式化、事件总线
// ─────────────────────────────────────────────────────────────

import { jsLog } from './tauri.js';

// ── 日志 ──
// 桌面端没有控制台，界面出问题时（白屏、按钮没反应）日志面板是唯一的线索。
// 因此这里同时做三件事：进内存环形缓冲（面板展示）、写 console（浏览器调试）、
// 上报到磁盘（进程崩了也能事后查）。

const LOG_MAX = 2000;
const logLines = [];
const logSubs = new Set();

export function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logLines.push(line);
    if (logLines.length > LOG_MAX) logLines.shift();
    logSubs.forEach((fn) => {
        try { fn(line, logLines); } catch (_) { /* 日志回调自身出错不再递归 */ }
    });
    console.log(line);
}

/** 同时写日志面板与磁盘。启动阶段与错误路径用这个。 */
export function logPersist(msg) {
    log(msg);
    jsLog(String(msg));
}

export function logText() { return logLines.join('\n'); }
export function clearLog() {
    logLines.length = 0;
    logSubs.forEach((fn) => { try { fn('', logLines); } catch (_) {} });
}

/** 订阅日志输出，返回取消订阅函数 */
export function onLog(fn) {
    logSubs.add(fn);
    return () => logSubs.delete(fn);
}

// ── 提示条 ──
// kind: 'ok' | 'err' | 'warn'

export function snack(msg, kind = 'ok', dur = 2600) {
    const old = document.querySelector('.snackbar');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'snackbar' + (kind === 'ok' ? '' : ' ' + kind);
    el.textContent = String(msg);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), dur);
}

export const snackErr = (msg, dur) => snack(msg, 'err', dur);
export const snackWarn = (msg, dur) => snack(msg, 'warn', dur);

// ── DOM 构造 ──
// 用来替代 innerHTML 字符串拼接：字符串拼 HTML 在插入用户数据时会引入
// 注入面，且拼错了不会报错、只会静默少一段界面。

export function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) e.setAttribute(k, '');
        else if (v === false) e.removeAttribute(k); // 布尔属性（disabled/checked…）false 必须移除，setAttribute('disabled','false') 仍是禁用
        else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
        if (c === null || c === undefined || c === false) continue;
        e.appendChild(typeof c === 'string' || typeof c === 'number'
            ? document.createTextNode(String(c))
            : c);
    }
    return e;
}

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 清空元素并返回它，便于链式复用容器 */
export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
}

// ── 事件总线 ──
// 面板之间不直接互相调用，一律通过事件解耦。面板切走后忘记取消订阅
// 是常见泄漏源，所以 on() 一律返回取消函数，且在创建面板时统一收口。

const listeners = new Map();

export function on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt)?.delete(fn);
}

export function emit(evt, payload) {
    const set = listeners.get(evt);
    if (!set) return;
    for (const fn of Array.from(set)) {
        try { fn(payload); } catch (e) { log(`事件 ${evt} 处理出错：${e}`); }
    }
}

// ── 格式化 ──

export function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
}

export function fmtTime(ms) {
    if (!ms) return '-';
    const d = new Date(Number(ms));
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
        + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtDuration(ms) {
    const s = Number(ms) / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60);
    return `${m}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
}

// ── 计时器 ──
// 每个面板都要显示「耗时」，散落各处的 Date.now() 差值容易写漏。

export function timer() {
    const t0 = Date.now();
    return {
        get ms() { return Date.now() - t0; },
        get sec() { return (Date.now() - t0) / 1000; },
        text() { return fmtDuration(this.ms); },
    };
}

// ── 错误上报 ──
// 桌面端没有控制台：前端一抛异常，用户看到的就是白屏或"点了没反应"，
// 拿不到任何信息。这里把 window.onerror / unhandledrejection 全部落到
// frontend.log，事后可以直接查文件。

export function installErrorReporter() {
    const rep = (msg) => logPersist(msg);
    window.addEventListener('error', (e) => {
        rep(`[error] ${e.message || '(无消息)'} @ ${e.filename || '?'}:${e.lineno || 0}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
        const r = e.reason;
        rep(`[reject] ${r && r.message ? r.message : String(r)}`);
    });
    // 暴露给 Rust 侧用 eval 探测「页面是否真的起来了」
    window.__uiKitReport = rep;
    return rep;
}

/** 供原生层探活的钩子名，改这里要同步改 rust 侧 */
export const READY_PROBE = 'window.__uiKitReport';
