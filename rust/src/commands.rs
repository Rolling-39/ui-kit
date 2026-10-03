// ─────────────────────────────────────────────────────────────
// tauri-ui-kit / commands.rs —— 需要注册进 invoke_handler 的命令
// ─────────────────────────────────────────────────────────────
// 为什么命令必须放在子模块里、不能写在 lib.rs 的根模块：
// #[tauri::command] 作用在 `pub fn` 上时会生成两个 #[macro_export] 的宏
// （__cmd__xxx 和 __tauri_command_name_xxx），同时还会生成一份
// `pub use __cmd__xxx;`。macro_export 把宏放到 crate 根，于是根模块里
// 「宏已存在」和「pub use 又导入一次」正面撞车，报 E0255。
// 放进子模块后，生成的 pub use 落在子模块命名空间，不再冲突。
// 这不是风格问题，写错就是 14 个编译错误。

use crate::{fail, os_build, BackdropReport, DEFAULT_TINT};

// ───────────────────────── 窗口背景 ─────────────────────────

/// 应用原生窗口背景。
///
/// `tint` 从 CSS 变量 --backdrop-tint 读出来，格式 r,g,b,a（a 为 0-255）。
/// `backend` 可选：
///   "acrylic"（默认，与现有三个项目的观感一致）
///   "mica"    仅 Win11，走 DWM 原生，可避开 Win10 那种拖动卡顿
///   "auto"    Win11 用 mica，其余用 acrylic
#[tauri::command]
pub fn ui_kit_apply_backdrop(
    window: tauri::WebviewWindow,
    tint: Option<(u8, u8, u8, u8)>,
    backend: Option<String>,
) -> Result<BackdropReport, String> {
    let color = tint.unwrap_or(DEFAULT_TINT);
    let want = backend.unwrap_or_else(|| "acrylic".into());
    let build = os_build();
    let win11 = build.map(|b| b >= 22000).unwrap_or(false);

    #[cfg(target_os = "windows")]
    {
        let use_mica = match want.as_str() {
            "mica" => true,
            "auto" => win11,
            _ => false,
        };

        if use_mica {
            // dark = None 表示跟随系统配色
            return match window_vibrancy::apply_mica(&window, None) {
                Ok(()) => Ok(BackdropReport {
                    applied: true,
                    backend: "mica".into(),
                    os_build: build,
                    detail: String::new(),
                }),
                Err(e) => Ok(fail(format!("apply_mica 失败：{e}"))),
            };
        }

        return match window_vibrancy::apply_acrylic(&window, Some(color)) {
            Ok(()) => Ok(BackdropReport {
                applied: true,
                backend: "acrylic".into(),
                os_build: build,
                detail: if win11 {
                    "Win11 走 DWM 分支，会忽略传入的 tint，背景由系统主题决定".into()
                } else {
                    "Win10 走 SWCA 分支，拖动/缩放窗口可能卡顿".into()
                },
            }),
            Err(e) => Ok(fail(format!("apply_acrylic 失败：{e}"))),
        };
    }

    #[cfg(target_os = "macos")]
    {
        let _ = (want, win11, color);
        // window-vibrancy 0.6 起这里是四个参数：material, state, radius。
        // 现有三个项目里写的都是两个参数的旧版签名，那段代码包在
        // #[cfg(target_os = "macos")] 下、又都没有 macOS 构建，所以一直没暴露。
        return match window_vibrancy::apply_vibrancy(
            &window,
            window_vibrancy::NSVisualEffectMaterial::HudWindow,
            None,
            None,
        ) {
            Ok(()) => Ok(BackdropReport {
                applied: true,
                backend: "vibrancy".into(),
                os_build: build,
                detail: String::new(),
            }),
            Err(e) => Ok(fail(format!("apply_vibrancy 失败：{e}"))),
        };
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (window, want, win11, color);
        Ok(fail("当前平台无原生模糊（Linux 等），请使用不透明兜底底色"))
    }
}

/// 清除原生背景，回到不透明窗口。
#[tauri::command]
pub fn ui_kit_clear_backdrop(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return window_vibrancy::clear_acrylic(&window).map_err(|e| e.to_string());
    }
    #[cfg(target_os = "macos")]
    {
        return window_vibrancy::clear_vibrancy(&window)
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = window;
        Ok(())
    }
}

// ───────────────────────── 窗口控制 ─────────────────────────
//
// 走自定义命令而不是前端直接调 core:window，
// 这样 capabilities 只需要 core:default，不必额外放开窗口权限。

#[tauri::command]
pub async fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_maximize_window(window: tauri::Window) -> Result<(), String> {
    let maximized = window.is_maximized().map_err(|e| e.to_string())?;
    if maximized {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn close_app_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

// ───────────────────────── 日志 ─────────────────────────

/// 前端日志上报入口（ui.js 的 logPersist / installErrorReporter 打到这）
#[tauri::command]
pub fn js_log(app: tauri::AppHandle, text: String) -> Result<(), String> {
    crate::append_frontend_log(&app, &text)
}

/// 返回前端日志文件路径，便于界面上直接展示给用户
#[tauri::command]
pub fn frontend_log_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(crate::frontend_log_path_of(&app)?
        .to_string_lossy()
        .to_string())
}
