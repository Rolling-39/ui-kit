// ─────────────────────────────────────────────────────────────
// tauri-ui-kit —— ui-kit 的原生侧
// ─────────────────────────────────────────────────────────────
// 命令定义在 commands 子模块里，这里不要直接写 #[tauri::command]，
// 原因见 commands.rs 顶部注释（会撞 E0255，14 个错误起步）。
//
// 下游用法：
//   .invoke_handler(tauri::generate_handler![
//       tauri_ui_kit::commands::ui_kit_apply_backdrop,
//       tauri_ui_kit::commands::minimize_window,
//       ...
//   ])

pub mod commands;

use std::io::Write;

use serde::Serialize;
use tauri::Manager;

/// 本平台是否具备原生窗口背景能力
pub const HAS_NATIVE_BACKDROP: bool = cfg!(any(target_os = "windows", target_os = "macos"));

/// 默认着色。仅 Windows 10 分支生效，Win11 会忽略。
pub const DEFAULT_TINT: (u8, u8, u8, u8) = (245, 250, 248, 96);

#[derive(Debug, Clone, Serialize)]
pub struct BackdropReport {
    /// 原生模糊是否真的应用成功。false 时前端必须保持不透明兜底底色。
    pub applied: bool,
    /// 实际使用的后端：acrylic / mica / vibrancy / none
    pub backend: String,
    /// 系统构建号（Windows 才有）。排查"这台机器为什么没效果"时先看这个数。
    pub os_build: Option<u32>,
    /// 失败原因或补充说明
    pub detail: String,
    /// 原生背景的明暗是否会按传入的 `dark` 走。
    ///
    /// false 表示这条后端我们控制不了明暗（Win11 的 DWM 分支忽略 tint、
    /// macOS 的 vibrancy 跟随系统外观）。此时若应用手动锁定了亮/暗，
    /// 前端要自己补一层对应该档位的底色，否则会出现"CSS 切了配色、
    /// 窗口背后的原生背景没切"，文字对比度掉到读不了。
    pub dark_honored: bool,
}

/// 当前系统构建号。Windows 用 windows-version，其他平台返回 None。
pub(crate) fn os_build() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        Some(windows_version::OsVersion::current().build)
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// 构造一个「没生效」的回报
pub(crate) fn fail(detail: impl Into<String>) -> BackdropReport {
    BackdropReport {
        applied: false,
        backend: "none".into(),
        os_build: os_build(),
        detail: detail.into(),
        // 没应用成功就谈不上"明暗被采纳"：前端会走不透明兜底底色，
        // 那层底色本身是按当前档位来的，明暗仍然正确。
        dark_honored: false,
    }
}

// ───────────────────────── 日志 ─────────────────────────

/// 启动日志：写系统临时目录，不依赖 AppHandle，可以在 tauri::Builder 之前调用。
/// 每次启动覆盖，最多几行，不会无限增长。
///
/// 桌面端没有控制台，界面白屏时这是唯一能确认「执行到哪一步」的手段。
pub fn boot_log(name: &str, msg: &str, truncate: bool) {
    let p = std::env::temp_dir().join(format!("{name}-boot.log"));
    let mut opt = std::fs::OpenOptions::new();
    opt.create(true).write(true);
    if truncate {
        opt.truncate(true);
    } else {
        opt.append(true);
    }
    if let Ok(mut f) = opt.open(&p) {
        let _ = writeln!(f, "{msg}");
    }
}

/// 前端日志文件路径
pub fn frontend_log_path_of(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录：{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建目录：{e}"))?;
    Ok(dir.join("frontend.log"))
}

/// 前端日志的体积上限。超过就保留尾部重写。
/// 桌面应用可能连续运行数周，只 append 不轮转会让这个文件无限增长。
const FRONTEND_LOG_MAX: u64 = 1024 * 1024; // 1 MB
/// 轮转后保留的尾部长度（按字节，实际会向后对齐到第一个换行）
const FRONTEND_LOG_KEEP: u64 = 256 * 1024;

/// 超过上限时把日志截成"尾部 KEEP 字节"。
/// 起点向后对齐到第一个换行，保证不会留下半行（否则首行会是残缺的堆栈或 JSON）。
fn rotate_frontend_log_if_needed(path: &std::path::Path) {
    let len = match std::fs::metadata(path) {
        Ok(m) => m.len(),
        Err(_) => return, // 文件还不存在，不需要轮转
    };
    if len <= FRONTEND_LOG_MAX {
        return;
    }
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return, // 读不到就放弃，下一条日志还会再试
    };
    let start = data.len().saturating_sub(FRONTEND_LOG_KEEP as usize);
    let from = data[start..]
        .iter()
        .position(|&b| b == b'\n')
        .map(|i| start + i + 1)
        .unwrap_or(start);
    let _ = std::fs::write(path, &data[from..]);
}

/// 追加一行到前端日志
pub fn append_frontend_log(app: &tauri::AppHandle, text: &str) -> Result<(), String> {
    let path = frontend_log_path_of(app)?;
    rotate_frontend_log_if_needed(&path);
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("无法打开日志：{e}"))?;
    writeln!(f, "{text}").map_err(|e| format!("写入失败：{e}"))
}

/// 启动后探活：等一段时间再探测页面是否真的加载了。
/// 界面没起来时，这段日志能直接区分「WebView 没加载到页面」和「前端脚本报错」。
///
/// `app_name` 决定 boot 日志的文件名（`%TEMP%\<app_name>-boot.log`），
/// 要和 `main()` 里 `boot_log` 用的名字一致，否则两处日志会分到不同文件。
///
/// 探测用的钩子是 ui.js 暴露的 window.__uiKitReport，改名要同步改前端。
pub fn spawn_ready_probe(
    app: &tauri::AppHandle,
    app_name: &str,
    webview_label: &str,
    delay_ms: u64,
) {
    let handle = app.clone();
    let label = webview_label.to_string();
    let name = app_name.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        let w = match handle.get_webview_window(&label) {
            Some(w) => w,
            None => return,
        };
        let url = w
            .url()
            .map(|u| u.to_string())
            .unwrap_or_else(|e| format!("<取不到: {e}>"));
        let probe = w
            .eval("window.__uiKitReport && window.__uiKitReport('[rust] 页面已就绪')")
            .map(|_| "ok")
            .unwrap_or("eval 失败");
        let line = format!("[rust] 窗口 url = {url}，页面探测 = {probe}");
        let _ = append_frontend_log(&handle, &line);
        boot_log(&name, &line, false);
    });
}
