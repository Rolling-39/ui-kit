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

/// 追加一行到前端日志
pub fn append_frontend_log(app: &tauri::AppHandle, text: &str) -> Result<(), String> {
    let path = frontend_log_path_of(app)?;
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
