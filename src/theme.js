// ─────────────────────────────────────────────────────────────
// ui-kit / theme.js —— 原生窗口背景的应用与探测
// ─────────────────────────────────────────────────────────────
// 这套 UI 的玻璃效果不是 CSS 能做出来的：真正在模糊的是窗口后面的
// 桌面（Windows Acrylic / Mica、macOS Vibrancy），CSS 只负责把表面做成半透明。
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
//
// ── 还有一半是"明暗" ──
// 应用支持手动锁定亮/暗（html[data-theme]）时，光切 CSS 变量是不够的：
// 原生背景可能由系统主题决定（Win11 的 DWM 后端忽略 tint），于是出现
// "CSS 已经切到浅色、窗口背后还是深色" —— 深色文字糊在深色底上。
// 这里分两层处理：
//   1. 把当前档位的明暗告诉原生层（readBackdropDarkness → applyBackdrop 的 dark）
//      **这个值必须是具体的 true/false，连"跟随系统"档也要提前解析掉。**
//      原生层那个参数最终落到 apply_mica 的 `if let Some(dark)` 上，
//      传 None 是"这一帧什么都不做"，属性会停在上一次的值上，于是
//      "锁浅色 → 切回跟随系统"会留下浅色窗口底配深色 CSS。踩过一次，见
//      readBackdropDarkness 的注释。
//   2. 原生层若回报 dark_honored = false（这条后端控制不了明暗），
//      在**锁定档**下补一层该档位的底色（.backdrop-forced）。
// 见 readBackdropDarkness / isThemeLocked / reflectBackdrop 的注释。

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

/**
 * 当前应当使用的原生背景明暗。**永远返回具体布尔值**，不返回 null。
 *
 * 判据直接取 CSS 里已经算好的 `color-scheme`：
 *   'dark'  → 应用锁定了深色 → true
 *   'light' → 应用锁定了浅色 → false
 *   两个值（'dark light'，没锁定、跟随系统）→ 就地解析成系统当前的实际取值
 *
 * 这样套件不必去理解"跟随系统 / 手动锁定"那套业务状态 —— CSS 已经表达过了，
 * 而 tokens.css 里正好要求锁定块必须声明 color-scheme。
 *
 * ── 为什么"跟随系统"也必须解析成具体值，不能留 null ──
 * 这个值最终交给 window-vibrancy 的 apply_mica(hwnd, dark)，而它的实现是：
 *
 *     if let Some(dark) = dark { DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ...) }
 *
 * 传 None 时整个分支被跳过 —— 它不是"跟随系统"，而是"这一帧什么都不做"，
 * 那个 DWM 属性会**停在最后一次被设过的值上**。于是"锁浅色 → 切回跟随系统"
 * 会留下浅色的原生底，而 CSS 已经跟着系统变成深色，得到浅底压深字的杂交态。
 * 实测那台机器上正文与底色的对比度只剩 1.39，界面基本读不了。
 *
 * 所以这里负责把"跟随系统"提前解析掉，让原生层永远收到具体值。
 */
export function readBackdropDarkness() {
    const v = getComputedStyle(document.documentElement).colorScheme.trim();
    if (v === 'dark') return true;
    if (v === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/**
 * 当前明暗是手工锁定（true）还是跟随系统（false）。
 *
 * 只用于一个判断：原生后端自己控制不了明暗时，要不要补一层自定义底色。
 * 跟随系统档不用补 —— 原生背景本来就跟着系统走，与 CSS 天然一致，
 * 补了反而白白损失玻璃质感。
 */
export function isThemeLocked() {
    const parts = getComputedStyle(document.documentElement).colorScheme.trim().split(/\s+/);
    return parts.length === 1 && (parts[0] === 'dark' || parts[0] === 'light');
}

let active = false;
let chosenBackend = 'acrylic';

/** 原生模糊是否已生效 */
export function isBackdropActive() { return active; }

/** 是否处于"原生背景明暗控制不了、因而补了自定义底色"的状态 */
export function isBackdropForced() {
    return document.documentElement.classList.contains('backdrop-forced');
}

/**
 * 把原生层的回报反映到 DOM 类名上。返回是否启用了"自己补底色"。
 *
 * 补底色的条件：原生模糊生效了、应用锁定了档位、而这条后端控制不了明暗。
 * 此时 .backdrop-fallback（按当前档位定义的渐变）重新显示在最底层，
 * 用高不透明度盖住颜色不对的原生背景，保证文字对比度正确。
 */
function reflectBackdrop(r) {
    const html = document.documentElement;
    active = !!r.applied;
    html.classList.toggle('backdrop-ok', active);
    // 只在"应用锁定了档位、而后端又控制不了明暗"时才补底色。
    // 跟随系统档不补：原生背景本来就跟着系统走，与 CSS 天然一致。
    const forced = active && isThemeLocked() && !r.dark_honored;
    html.classList.toggle('backdrop-forced', forced);
    return forced;
}

function describeDarkness(dark) {
    if (dark === true) return '深色';
    if (dark === false) return '浅色';
    return '跟随系统';
}

/** 日志里的明暗描述：锁定时只说档位，跟随时补上"实际取到哪一档" */
function describeMode(dark) {
    return isThemeLocked() ? describeDarkness(dark) : `跟随系统（当前${describeDarkness(dark)}）`;
}

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
        html.classList.remove('backdrop-ok', 'backdrop-forced');
        log('已按配置强制使用不透明兜底底色');
        return { applied: false, backend: 'disabled', os_build: null, detail: '配置强制关闭', dark_honored: false };
    }

    if (!isTauri) {
        // 浏览器里没有原生层，保持兜底。开发时想看玻璃效果可以手动
        // document.documentElement.classList.add('backdrop-ok') 并自备背景图。
        active = false;
        html.classList.remove('backdrop-ok', 'backdrop-forced');
        log('不在 Tauri 容器内，窗口背景使用不透明兜底');
        return { applied: false, backend: 'browser', os_build: null, detail: '不在 Tauri 容器内', dark_honored: false };
    }

    const dark = readBackdropDarkness();
    const r = await applyBackdrop(tint, backend, dark);
    const forced = reflectBackdrop(r);
    const build = r.os_build ? ` Windows build ${r.os_build}` : '';
    log(active
        ? `原生窗口背景已生效：${r.backend}${build}（tint ${tint ? tint.join(',') : '默认'}｜明暗 ${describeMode(dark)}）`
            + (r.detail ? `｜注意：${r.detail}` : '')
        : `原生窗口背景不可用，已切换为不透明兜底：${r.backend}${build} ${r.detail || ''}`.trim());
    if (forced) {
        log(`该后端（${r.backend}）决定不了原生背景的明暗，已补一层${describeDarkness(dark)}底色，`
            + '避免锁定亮/暗后文字与背景对比度不足');
    }
    return r;
}

/**
 * 系统切换亮/暗色时重新取 tint 并重设原生背景。
 *
 * 这条路径是"跟随系统"档能自动跟上的唯一保障，所以不能省：
 * 系统配色变了，readBackdropDarkness() 会解析出新的取值，
 * 这里负责把它重新推给原生层（第 1 层），而不是指望原生层自己会变。
 */
export function watchColorScheme(onChange) {
    if (!window.matchMedia) return () => {};
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = async () => {
        const tint = readBackdropTint();
        const dark = readBackdropDarkness();
        const r = await applyBackdrop(tint, chosenBackend, dark);
        // 这里必须一起更新 active：否则 isBackdropActive() 会一直返回
        // 首次探测时的旧值，而界面上的类名已经是新的了，两者对不上。
        const forced = reflectBackdrop(r);
        log(`系统配色已切换，原生背景重设：${active ? r.backend : '兜底'}`
            + `（明暗 ${describeDarkness(dark)}）`
            + (forced ? '（并补了自定义底色）' : ''));
        if (typeof onChange === 'function') onChange(r);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
}

/**
 * 手动重设原生背景。
 * 设置页换主题色、或切换"跟随系统 / 亮 / 暗"之后都要调一次：
 * 后者会改 color-scheme，从而改要传给原生层的明暗。
 */
export async function refreshBackdrop(backend = chosenBackend) {
    chosenBackend = backend;
    const dark = readBackdropDarkness();
    const r = await applyBackdrop(readBackdropTint(), backend, dark);
    reflectBackdrop(r);
    return r;
}
