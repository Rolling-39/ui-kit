// ─────────────────────────────────────────────────────────────
// ui-kit / theme.js —— 原生窗口背景的应用与探测
// ─────────────────────────────────────────────────────────────
// 这套 UI 的玻璃效果不是 CSS 能做出来的：真正在模糊的是窗口后面的
// 桌面（Windows Acrylic / macOS Vibrancy），CSS 只负责把表面做成半透明。
// 所以页面必须确认「原生模糊到底生没生效」：
//
//   生效  → <html> 加 .backdrop-ok，表面转透明，玻璃透出桌面
//   没生效 → 保持 shell.css 里的不透明兜底底
//
// 顺序是刻意反过来的。默认透明、失败再补底色的写法，在 Linux 或老
// Windows 上会得到「窗口透明 + 内容只有 0.15 不透明度」，文字直接糊在
// 桌面上，而用户只会以为是自己眼花了。
//
// 着色值来自 CSS 变量 --backdrop-tint，不在 Rust 里硬编码：
// 换主题只改 tokens.css，不需要重新编译 Rust。

import { applyBackdrop, isTauri } from './tauri.js';
import { log } from './ui.js';

const KEY = '--backdrop-tint';

/** 从 CSS 变量读原生背景着色，返回 [r,g,b,a] 或 null */
export function readBackdropTint() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(KEY);
    if (!raw) return null;
    const parts = raw.split(',').map((s) => parseInt(s.trim(), 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    return parts;
}

let active = false;
let chosenBackend = 'acrylic';

/** 原生模糊是否已生效 */
export function isBackdropActive() { return active; }

/**
 * 应用原生背景并把结果反映到 DOM 类名上。
 * @param {{backend?: 'acrylic'|'mica'|'auto', force?: boolean}} [opts]
 *   backend 默认 acrylic（与现有三个项目外观一致）；Win11 想避开 SWCA 可传 'mica'。
 *   force = false 时无条件走兜底底色，给"用户反馈透明窗口不好用"留一个开关。
 */
export async function initBackdrop(opts = {}) {
    const { backend = chosenBackend, force = true } = opts;
    chosenBackend = backend;
    const html = document.documentElement;
    const tint = readBackdropTint();

    if (!force) {
        active = false;
        html.classList.remove('backdrop-ok');
        log('已按配置强制使用不透明兜底底色');
        return { applied: false, backend: 'disabled', os_build: null, detail: '配置强制关闭' };
    }

    if (!isTauri) {
        // 浏览器里没有原生层，保持兜底。开发时想看玻璃效果可以手动
        // document.documentElement.classList.add('backdrop-ok') 并自备背景图。
        active = false;
        log('不在 Tauri 容器内，窗口背景使用不透明兜底');
        return { applied: false, backend: 'browser', os_build: null, detail: '不在 Tauri 容器内' };
    }

    const r = await applyBackdrop(tint, backend);
    active = !!r.applied;
    html.classList.toggle('backdrop-ok', active);
    const build = r.os_build ? ` Windows build ${r.os_build}` : '';
    log(active
        ? `原生窗口背景已生效：${r.backend}${build}（tint ${tint ? tint.join(',') : '默认'}）`
            + (r.detail ? `｜注意：${r.detail}` : '')
        : `原生窗口背景不可用，已切换为不透明兜底：${r.backend}${build} ${r.detail || ''}`.trim());
    return r;
}

/** 系统切换亮/暗色时重新取 tint 并重设原生背景 */
export function watchColorScheme(onChange) {
    if (!window.matchMedia) return () => {};
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = async () => {
        const tint = readBackdropTint();
        const r = await applyBackdrop(tint, chosenBackend);
        document.documentElement.classList.toggle('backdrop-ok', !!r.applied);
        log(`系统配色已切换，原生背景重设：${r.applied ? r.backend : '兜底'}`);
        if (typeof onChange === 'function') onChange(r);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
}

/** 手动重设原生背景（例如设置页换主色后调用） */
export async function refreshBackdrop(backend = chosenBackend) {
    chosenBackend = backend;
    const r = await applyBackdrop(readBackdropTint(), backend);
    document.documentElement.classList.toggle('backdrop-ok', !!r.applied);
    return r;
}
