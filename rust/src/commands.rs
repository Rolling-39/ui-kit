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
/// `dark` 期望的原生背景明暗：true 深色 / false 浅色。**必填，且必须是具体值。**
///
///   之所以不设成 `Option<bool>`：window-vibrancy 的 `apply_mica(hwnd, dark)`
///   实现是 `if let Some(dark) = dark { DwmSetWindowAttribute(...) }`，
///   传 `None` 时整个分支被跳过 —— 那不是"跟随系统"，而是"这一帧什么都不做"，
///   那个 DWM 属性会**停在最后一次被设过的值上**。踩过一次：
///   应用内锁浅色（属性写成浅）→ 切回"跟随系统"（传 None，属性没被改）
///   → 系统是深色、CSS 已经变深，窗口底却还是浅的 → 深字压浅底，
///   实测对比度只剩 1.39。把参数设成必填，这类静默失败就不可能再出现。
///
///   "跟随系统"这一档由前端 `theme.js` 的 `readBackdropDarkness()` 提前
///   解析成具体布尔值再传进来（它用 matchMedia 读系统偏好），本命令只负责如实执行。
#[tauri::command]
pub fn ui_kit_apply_backdrop(
    window: tauri::WebviewWindow,
    tint: Option<(u8, u8, u8, u8)>,
    backend: Option<String>,
    dark: bool,
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
            // 这里必须把 dark 传给 DWM，不能省略。
            //
            // window-vibrancy 的第二个参数就是 DWM 的 immersive dark mode：
            // 传 Some(false) 让 DWM 画浅色底，不再看系统脸色。
            //
            // 反例（曾经的写法）：传 None。它不会"跟随系统"，只会什么都不做，
            // 属性留在上一次的值上 —— 于是应用里锁浅色时会出现：CSS 已经切到
            // 浅色（--on-surface 变成近黑的 #191C1C），而窗口背后的 Mica 仍是
            // 系统那套深色，深色文字糊在深色底上。实测环境：Windows 11
            // build 26200 + 系统深色 + 应用内锁亮，侧栏标签对比度只有 1.13。
            // 更隐蔽的是反过来的序列：锁浅色 → 切回跟随系统（系统深色），
            // 窗口底停在浅色、CSS 已经变深，正文对比度实测 1.39。
            return match window_vibrancy::apply_mica(&window, Some(dark)) {
                Ok(()) => Ok(BackdropReport {
                    applied: true,
                    backend: "mica".into(),
                    os_build: build,
                    detail: if dark {
                        "已按深色设置原生背景".into()
                    } else {
                        "已按浅色设置原生背景".into()
                    },
                    // mica 认这个参数
                    dark_honored: true,
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
                // Win10 的 SWCA 分支认 tint，明暗由着色决定；
                // Win11 的 DWM 分支既忽略 tint、也没有明暗开关，所以控制不了。
                dark_honored: !win11,
            }),
            Err(e) => Ok(fail(format!("apply_acrylic 失败：{e}"))),
        };
    }

    #[cfg(target_os = "macos")]
    {
        let _ = (want, win11, color, dark);
        // window-vibrancy 0.6 起这里是四个参数：material, state, radius。
        // 现有三个项目里写的都是两个参数的旧版签名，那段代码包在
        // #[cfg(target_os = "macos")] 下、又都没有 macOS 构建，所以一直没暴露。
        // 这里没有明暗开关（跟随系统外观），所以 dark_honored = false。
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
                detail: "macOS 的 vibrancy 跟随系统外观，无法按应用锁定切换".into(),
                dark_honored: false,
            }),
            Err(e) => Ok(fail(format!("apply_vibrancy 失败：{e}"))),
        };
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (window, want, win11, color, dark);
        Ok(fail("当前平台无原生模糊（Linux 等），请使用不透明兜底底色"))
    }
}

/// 清除原生背景，回到不透明窗口。
///
/// **这里刻意用 `clear_acrylic`，不要"按当前后端选 clear_mica"。**
/// 上游 window-vibrancy 0.6.0 的两个实现在 Win11 上是同一行调用
/// （`windows.rs` 里 `clear_acrylic` 与 `clear_mica` 都执行
/// `DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_DISABLE, 4)`），
/// 所以它对 mica 窗口同样有效；而在 Win10（build 17763 ~ 22523）
/// `is_backdroptype_supported()` 为假，只有 clear_acrylic 走 SWCA 那条路可用，
/// clear_mica 会直接返回 `UnsupportedPlatformVersion`。
/// 换句话说 clear_acrylic 的覆盖面更广，改成 clear_mica 是功能退化。
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
