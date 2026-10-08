// ─────────────────────────────────────────────────────────────
// ui-kit / tauri.js —— Tauri 运行时桥接层
// ─────────────────────────────────────────────────────────────
// 两种运行环境都要能用：
//   1. Tauri 桌面端：用运行时注入的 window.__TAURI__（需要 withGlobalTauri: true）
//   2. 普通浏览器：所有调用降级为桩函数，界面照样能跑起来
// 第 2 条是刻意的：这套 UI 全部是 DOM，能在 Chrome 里改样式比每次
// 重新编译 Rust 快一个数量级。业务层只要自己提供一份 mock 数据即可。

const T = typeof window !== 'undefined' ? window.__TAURI__ : null;

/** 是否运行在 Tauri 容器内 */
export const isTauri = !!(T && T.core && typeof T.core.invoke === 'function');

function notInTauri() {
    return Promise.reject(new Error('未在 Tauri 环境中运行'));
}

/** 调用 Rust 端命令。不在 Tauri 里会 reject。 */
export const invoke = isTauri ? T.core.invoke.bind(T.core) : notInTauri;

/** 调用 Rust 端命令，但不在 Tauri 里时返回兜底值而不是抛错 */
export function invokeOr(fallback, cmd, args) {
    if (!isTauri) return Promise.resolve(fallback);
    return invoke(cmd, args).catch(() => fallback);
}

/** 监听 Rust 端事件，返回 unlisten 函数 */
export function listen(event, cb) {
    if (isTauri && T.event && T.event.listen) return T.event.listen(event, cb);
    return Promise.resolve(() => {});
}

/** 文件选择对话框，返回绝对路径或 null */
export async function openDialog(options = {}) {
    if (!isTauri) return null;
    try {
        const r = await invoke('plugin:dialog|open', { options });
        if (Array.isArray(r)) return r[0] || null;
        return r || null;
    } catch (e) {
        throw new Error('打开文件对话框失败：' + e);
    }
}

/** 保存对话框，返回绝对路径或 null */
export async function saveDialog(options = {}) {
    if (!isTauri) return null;
    try {
        return (await invoke('plugin:dialog|save', { options })) || null;
    } catch (e) {
        throw new Error('打开保存对话框失败：' + e);
    }
}

// ── 窗口控制 ──
// 走自定义 Rust 命令而不是 @tauri-apps/api/window：这样 capabilities 里
// 不需要开 core:window 权限，命令名在三个项目里也已经统一成同一套。

export function minimizeWindow() {
    return isTauri ? invoke('minimize_window').catch(() => {}) : Promise.resolve();
}

export function toggleMaximizeWindow() {
    return isTauri ? invoke('toggle_maximize_window').catch(() => {}) : Promise.resolve();
}

export function closeWindow() {
    return isTauri ? invoke('close_app_window').catch(() => {}) : Promise.resolve();
}

/** 把前端日志写到磁盘（原生层落在 app_config_dir/frontend.log） */
export function jsLog(text) {
    if (!isTauri) return Promise.resolve();
    return invoke('js_log', { text: String(text) }).catch(() => {});
}

/** 取前端日志文件路径，便于在界面上展示给用户 */
export function frontendLogPath() {
    return invokeOr('', 'frontend_log_path');
}

// ── 原生窗口背景 ──

/** 当前系统是否偏好深色。用于把"跟随系统"档解析成具体值 */
function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/**
 * 应用原生窗口背景（Windows Acrylic / Mica、macOS Vibrancy）。
 * @param {[number,number,number,number]|null} tint r,g,b,a（a 为 0-255）。仅 Windows 10 生效。
 * @param {'acrylic'|'mica'|'auto'} [backend] 默认 acrylic，与现有项目外观一致
 * @param {boolean|null} [dark] 期望的原生背景明暗：true 深 / false 浅。
 *   **不要传 null 表示"跟随系统"。** 原生层收到 None 时不是"跟随系统"，而是
 *   "别动这个属性"，那个 DWM 属性会停在上一次被设过的值上 —— 于是
 *   "锁浅色 → 切回跟随系统"会留下浅色的窗口底，配着已经变深的 CSS
 *   （详见 theme.js 的 readBackdropDarkness）。这里对 null/undefined 做一次
 *   兜底解析，保证发出去的永远是具体值。
 * @returns {Promise<{applied:boolean, backend:string, os_build:number|null,
 *   detail:string, dark_honored:boolean}>}
 *   dark_honored = false 表示这条后端控制不了明暗，调用方要自己补底色。
 */
export function applyBackdrop(tint, backend, dark) {
    if (!isTauri) {
        return Promise.resolve({
            applied: false, backend: 'browser', os_build: null,
            detail: '不在 Tauri 容器内', dark_honored: false,
        });
    }
    return invoke('ui_kit_apply_backdrop', {
        tint: tint || null,
        backend: backend || null,
        dark: typeof dark === 'boolean' ? dark : systemPrefersDark(),
    })
        .catch((e) => ({
            applied: false, backend: 'error', os_build: null,
            detail: String(e), dark_honored: false,
        }));
}

/**
 * 清除原生背景，回到不透明窗口。
 *
 * 命令内部按平台分发（Windows 用 clear_acrylic —— 上游在 Win11 上它与 clear_mica
 * 是同一行 DWM 调用，而在 Win10 只有它能用，覆盖面更广），所以调用方不需要
 * 关心当前是哪条后端。
 *
 * @returns {Promise<boolean>} 是否清除成功（不在 Tauri 内或调用失败时返回 false）
 */
export function clearBackdrop() {
    if (!isTauri) return Promise.resolve(false);
    return invoke('ui_kit_clear_backdrop').then(() => true).catch(() => false);
}
