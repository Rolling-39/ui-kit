# @rolling/ui-kit

Rolling 的 Tauri 桌面应用界面套件。把原本在多个项目里各抄一份的毛玻璃 UI，收成一套可升级的公共资产。

原先是三份互相分叉的手工拷贝（Base64 Tool Desktop、S2PNG Tool Desktop、Keypad Tool），
同一个视觉体系、三份不同的实现，修好的改动无法回流。本仓库是这套 UI 的唯一真源。

| | |
|---|---|
| 前端 | 原生 ES 模块 + 纯 CSS，无框架、无预处理器，Vite 直接吃 |
| 原生 | 独立 Rust crate（`tauri-ui-kit`），只依赖 `tauri` / `serde` / `window-vibrancy` |
| 许可 | MIT |

## 它提供什么

窗口背景（Windows Acrylic / Mica、macOS Vibrancy）的**应用与生效探测**、自定义标题栏与侧栏骨架、
面板注册与生命周期、跨面板的事件总线与日志面板、前端异常落盘、以及一整套玻璃风格组件类。

它**不**提供业务组件。键盘可视化（`.keycap`/`.stage`）、宏编辑器、测试网格、色板这类带业务含义的东西留在各自项目里。

## 目录

```
ui-kit/
├── src/
│   ├── index.css            样式入口，按 tokens → shell → glass 顺序聚合
│   ├── tokens.css           主题唯一真源：颜色、圆角、字体、原生背景着色
│   ├── shell.css            窗口骨架与背景策略
│   ├── glass.css            通用组件（卡片/按钮/输入/进度/结果列表/提示条…）
│   ├── tauri.js             Tauri 桥接，浏览器里自动降级为桩函数
│   ├── ui.js                日志、提示条、DOM 构造、格式化、事件总线、异常上报
│   ├── theme.js             原生背景的应用与生效探测
│   ├── shell.js             createShell：标题栏 + 导航 + 面板生命周期 + 路由
│   └── shell.template.html  窗口骨架模板，复制到项目的 src/index.html
├── rust/                    独立 crate：tauri-ui-kit
└── demo/                    组件预览，不需要 Tauri、不需要构建
```

## 预览

```bash
python -m http.server 8899 --directory <本仓库路径>
# 打开 http://127.0.0.1:8899/demo/
# 加 ?blur=1 直接看玻璃效果
```

`demo/preview-blur.png` 是有原生模糊时的样子（背后是 demo 自己造的假桌面），
`demo/preview-fallback.png` 是没有原生模糊时的兜底样子。两者用的是同一套 CSS。

## 接入一个 Tauri 项目

### 1. 前端依赖

```bash
npm install ../ui-kit
```

`package.json` 会出现 `"@rolling/ui-kit": "file:../ui-kit"`。
`file:` 依赖是符号链接，Vite 默认不跟随 `root` 之外的软链，所以要在 `vite.config.js` 里放行：

```js
export default defineConfig({
    root: 'src',
    build: { outDir: '../dist' },
    server: { port: 1420, strictPort: true, fs: { allow: ['..'] } },
    resolve: { preserveSymlinks: false },
});
```

### 2. 页面骨架

把 `src/shell.template.html` 复制成项目的 `src/index.html`，替换 `__APP_NAME__` 三处。

**不要**在 `<html>`/`<body>` 上写内联 `style="background:transparent"` —— 背景策略由
`shell.css` + `theme.js` 统一管，写死了就没法退回兜底底色。

### 3. 入口

```js
import '@rolling/ui-kit/index.css';
import { createShell } from '@rolling/ui-kit/shell';

await createShell({
    appName: 'Base64 Tool',
    panels: {
        encode: { title: '加密', icon: '+', load: () => import('./panels/encode.js') },
        decode: { title: '解密', icon: '-', load: () => import('./panels/decode.js') },
        log:    { title: '日志', icon: 'L', load: () => import('./panels/log.js') },
    },
    defaultPanel: 'encode',
});
```

`createShell` 负责：绑定三个窗口按钮、按面板清单生成导航、懒加载面板、切面板时 `await` 上一个面板的
`destroy()`、把异常装进 `frontend.log`、应用原生背景、处理 `#面板名` 直达。

### 4. 面板契约

```js
export function mount(root) {
    // 往 root 里建界面
    return {
        destroy() {},   // 切走前被 await：停定时器、退订、停监听线程
        refresh() {},   // 由 shell.refresh() 调用
    };
}
```

`destroy` 不是可选项。面板里起的系统级监听（比如 Raw Input 线程）不显式停掉会一直在后台跑。

### 5. Rust 侧

`src-tauri/Cargo.toml`：

```toml
[dependencies]
tauri-ui-kit = { path = "../../ui-kit/rust" }
window-vibrancy = "0.6"
```

`src-tauri/src/main.rs`：

```rust
use tauri::Manager;

fn main() {
    tauri_ui_kit::boot_log("base64-tool", "启动", true);   // 必须在 Builder 之前

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            tauri_ui_kit::spawn_ready_probe(app.handle(), "main", 2500);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 你的业务命令…
            tauri_ui_kit::commands::ui_kit_apply_backdrop,
            tauri_ui_kit::commands::ui_kit_clear_backdrop,
            tauri_ui_kit::commands::minimize_window,
            tauri_ui_kit::commands::toggle_maximize_window,
            tauri_ui_kit::commands::close_app_window,
            tauri_ui_kit::commands::js_log,
            tauri_ui_kit::commands::frontend_log_path,
        ])
        .run(tauri::generate_context!())
        .expect("启动失败");
}
```

**不要**再在 `setup` 里直接调 `apply_acrylic` —— 前端会通过 `ui_kit_apply_backdrop` 统一应用，
这样"生效没生效"才有回报，也才能退回兜底底色。

### 关于 `#[tauri::command]` 的一个硬性约束

如果在自己的 `main.rs` / `lib.rs` **根模块**里写命令，函数**不能是 `pub`**。

`#[tauri::command]` 作用在 `pub fn` 上时会生成两个带 `#[macro_export]` 的宏，
而 `macro_export` 只能把宏放到 crate 根；紧接着宏还会再生成一份 `pub use __cmd__xxx;`，
于是在根模块里「宏已存在」和「再导入一次」正面撞车，报 E0255，一条命令两个错误。
函数是私有的就不会加 `macro_export`，所以不冲突 —— 现有项目里 Base64 把命令写成一堆私有 `fn`
放在 `main.rs` 里一直没事，Keypad 写成 `pub fn` 但放进了 `commands.rs` 子模块里，
两者都能编译，原因就在这里。

要给别的 crate 用（必须是 `pub`）就放进子模块，本 crate 的 `commands` 就是这么来的。

### 6. 窗口配置

`src-tauri/tauri.conf.json`：

```json
"app": {
  "withGlobalTauri": true,
  "windows": [{
    "decorations": false,
    "transparent": true,
    "minWidth": 800,
    "minHeight": 540
  }]
}
```

`capabilities/default.json` 只需要：

```json
"permissions": ["core:default", "dialog:default", "dialog:allow-open", "dialog:allow-save"]
```

窗口控制走自定义命令，所以**不需要**开 `core:window`。

## 主题定制

只改 `src/tokens.css`。颜色以 `"R, G, B"` 三元组定义，再由 `rgb()` 派生，
所以需要透明度的场合直接写 `rgba(var(--primary-rgb), 0.15)`，不需要到处抄色值。

```css
:root {
    --primary-rgb: 57, 197, 187;   /* 改这一个 */
}
```

## 窗口背景：为什么默认是不透明

真正在模糊的是窗口后面的桌面（DWM），CSS 只负责把表面做成半透明。所以页面必须确认原生模糊到底生没生效：

- 生效 → `<html>` 加 `.backdrop-ok`，表面转透明，玻璃透出桌面
- 没生效 → 保持 `shell.css` 里的不透明兜底渐变

顺序是刻意反过来的。默认透明、失败再补底色的写法，在 Linux 或老 Windows 上会得到
「窗口透明 + 内容只有 0.15 不透明度」，文字直接糊在桌面上，而用户只会以为是自己眼花了。

### 平台矩阵

| 平台 | 后端 | 结果 |
|---|---|---|
| Windows 11 build ≥ 22523 | `DwmSetWindowAttribute(SYSTEMBACKDROP_TYPE)` | 生效。**传入的 tint 被忽略**，背景跟随系统主题 |
| Windows 10 build ≥ 17763 | `SetWindowCompositionAttribute(ACRYLICBLURBEHIND)` | 生效，tint 有效。已知拖动/缩放窗口会卡顿（上游用的非公开接口） |
| Windows 10 更低版本 | — | 报错 → 前端自动切兜底底色 |
| macOS | `NSVisualEffectMaterial::HudWindow` | 生效 |
| Linux | — | 无原生模糊 → 自动切兜底底色 |

`createShell` 的 `backdropBackend` 可选 `'acrylic'`（默认，与现有项目外观一致）、
`'mica'`（仅 Win11，走 DWM 原生，可避开上面那条拖动卡顿）、`'auto'`。
置 `useBackdrop: false` 可强制使用兜底底色。

运行日志里会打出实际走的后端和 Windows 构建号，排查"这台机器为什么没效果"时先看这一行。

## 已知限制

- Win11 上 acrylic 的着色由系统决定，改 `--backdrop-tint` 只在 Win10 生效。
- Win10 的 acrylic 用非公开接口，拖动窗口可能卡顿；Win11 可改用 `mica`。
- 三个旧项目的 `apply_vibrancy` 写的是 0.6 之前的两个参数版本。那段代码在
  `#[cfg(target_os = "macos")]` 下，而它们都没有 macOS 构建，所以编译不过这件事一直没被发现。
  本 crate 用的是四参数签名，照抄旧代码到 macOS 目标会失败。
- `tauri.conf.json` 的 `csp` 建议不要留 `null`。需要放行非 `'self'` 资源时显式写策略。
- 未做 macOS 与 Linux 的实机验证，只有 Windows 上验证过。

## 依赖里的那个 indexmap 不是笔误

`rust/Cargo.toml` 里同时出现在 `[dependencies]` 和 `[build-dependencies]` 的 `indexmap` 是环境适配，
删掉会直接编译失败：

```
error[E0107]: struct takes 3 generic arguments but 2 generic arguments were supplied
  --> schemars-0.8.22/src/lib.rs:12:32
```

`schemars`（tauri 的传递依赖）在开启 `preserve_order` 时写的是 indexmap 1.x 的 `IndexMap<K, V>`
两参数形式，只有 indexmap 的 `std` 特性开启时 `S` 才有默认值。indexmap 1.9 的 `build.rs`
用 autocfg 探测 std，在本机环境下探测不到，于是整个依赖树编译不过。

两处都必须声明，因为 resolver v2 对构建期依赖与普通依赖的特性分开解析：
indexmap 被构建期那侧（tauri → tauri-build → schemars）和普通依赖侧各拉了一份，只写一处不生效。
由本 crate 声明之后，下游应用不必再各自处理这个问题。

## 迁移现有项目时的视觉差异

本套件以 **Keypad Tool 的那份为基线**，因此 Base64 / S2PNG 迁移后会有以下几处外观变化，
都是有意为之，但应当在实机上确认过再合并：

| 项 | 变化 |
|---|---|
| 分段开关内边距 | `10px 0` → `9px 10px`（长中文标签不再贴边） |
| 导航项内边距 | `12px 14px` → `10px 14px` |
| 撑满型按钮行 | 类名从 `.btn-row` 改为 `.btn-row.fill`，Base64 的加密/解密页需要改 class |
| 浅色模式背景 | `--backdrop-tint` 由深色值改为浅色值，浅色模式下玻璃不再发灰 |
| 品牌色 | 不再有字面量 `rgba(57,197,187,…)`，全部走 `--primary-rgb`；换主题只需要改一个变量 |
| 兜底策略 | 原生模糊不可用时不再透明，改为不透明渐变底 |

## 开发

```bash
# 预览组件
python -m http.server 8899 --directory .

# 校验 Rust 侧能否编译（不需要 Tauri 项目）
cargo check --manifest-path rust/Cargo.toml
```
