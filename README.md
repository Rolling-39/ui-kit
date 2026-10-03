# @rolling/ui-kit

Rolling 的 Tauri 桌面应用界面套件。把原本在多个项目里各抄一份的毛玻璃 UI，收成一套可升级的公共资产。

原先是三份互相分叉的手工拷贝（Base64 Tool Desktop、S2PNG Tool Desktop、Keypad Tool）：
同一个视觉体系、三份不同的实现，修好的改动无法回流 —— S2PNG 里修好的边框可见度，Base64 里并没有。
本仓库是这套 UI 的唯一真源。

| | |
|---|---|
| 前端 | 原生 ES 模块 + 纯 CSS，无框架、无预处理器，Vite 直接吃 |
| 原生 | 独立 Rust crate `tauri-ui-kit`，只依赖 `tauri` / `serde` / `window-vibrancy` |
| 许可 | MIT |
| 验证范围 | 仅 Windows 实机验证过。macOS / Linux 未实测 |

---

## 一、这个目录够不够用

**前端侧够用，原生侧不够。** 换句话说：不能只把这个目录复制进项目就完事。

| 部分 | 能否由本目录直接提供 |
|---|---|
| 主题变量、组件样式、窗口骨架、导航与面板生命周期、日志与提示条 | 可以，`import` 即可 |
| 窗口背景（Acrylic/Mica/Vibrancy）的应用与生效探测 | 逻辑在本目录，但**命令必须由你的应用注册** |
| 窗口最小化/最大化/关闭、前端日志落盘 | 同上，**必须由你的应用注册** |
| 窗口尺寸、`decorations`/`transparent`、`capabilities` 权限 | 不能，属于每个应用自己的配置 |
| 业务界面（编码页、灯效页、键位页） | 不能，也不应该 —— 那是业务，不是 UI 套件 |

原因是 Tauri 的架构决定的：`invoke_handler` 只能由生成 `tauri::Context` 的那个应用声明，
一个库没办法把自己"塞进"别人的 handler 里。所以每个项目都要做一次约 10 行的接线。

接入要做的四件事（详见 [docs/USAGE.md](docs/USAGE.md)）：

1. `npm install ../ui-kit` —— 装成 `file:` 本地依赖
2. `Cargo.toml` 加 `tauri-ui-kit = { path = "../../ui-kit/rust" }`
3. `main.rs` 里注册 7 个命令，并调用 `boot_log` / `spawn_ready_probe`
4. 复制 `src/shell.template.html`，照抄 `tauri.conf.json` 的窗口与 `capabilities` 片段

**另外注意本套件是本地路径依赖**：那三个项目与 `ui-kit` 的相对位置关系是硬编码在 `Cargo.toml` 的 `path` 里的。
`ui-kit` 目录被移动、改名、或项目被挪到别处，都要同步改路径。若以后想避免这个问题，可以把
`ui-kit` 推到私有仓库改用 git 依赖。

## 二、它提供什么

| 能力 | 说明 |
|---|---|
| 主题 | 一套 CSS 变量定义全部配色、圆角、字体、阴影；品牌色用 RGB 三元组派生，换主题只改一处 |
| 窗口背景 | Windows Acrylic / Mica、macOS Vibrancy 的应用，**并把"到底生没生效"回报给前端** |
| 窗口骨架 | 自定义标题栏（含拖拽区）、侧栏导航、内容区、响应式断点 |
| 组件 | 卡片、按钮 6 种、输入 4 种、分段开关、标签块、徽标、状态点、指标网格、键值行、结果区、进度条、加载行、提示条等 |
| 面板框架 | 面板清单注册、懒加载、`destroy`/`refresh` 生命周期、`#面板名` 直达路由、导航角标 |
| 工具 | 日志（内存 + 面板 + 落盘三路）、提示条、`el()` DOM 构造、文件大小/时间/耗时格式化、事件总线 |
| 排障 | 前端异常自动落盘到 `frontend.log`、启动日志、启动后页面探活 |

它**不**提供业务组件。键盘可视化（`.keycap`/`.stage`）、宏编辑器、测试网格、色板这类带业务含义的东西留在各自项目里。

## 三、四个设计决策，以及为什么这么做

这几条都是踩过坑之后才定下来的，改动它们之前先读理由。

### 1. 背景默认不透明，确认生效才转透明

真正在模糊的是窗口后面的桌面（DWM），CSS 只负责把表面做成半透明。而原生模糊**不是所有平台都有**：
Linux 没有，Windows 10 1809 以下没有。如果默认就把窗口做成透明 + 表面 0.15 不透明度，
在这些平台上得到的是「文字直接糊在桌面上」，而用户只会以为是自己眼花了。

所以顺序是反的：`shell.css` 默认给 `<html>` 一个不透明兜底渐变；`theme.js` 调原生命令，
只有拿到 `applied: true` 才加 `.backdrop-ok` 把表面切成透明。失败模式的严重程度从"不可读"降到"只是不好看"。

### 2. 着色值放在 CSS 里，不放 Rust 里

窗口背景的 tint 定义在 `tokens.css` 的 `--backdrop-tint`，前端读出来传给原生层。
原先三个项目都是在 `main.rs` 里硬编码 `Some((18, 18, 18, 64))`，后果是换主题要改 Rust 并重新编译，
而且同一个字面量被抄进了三个仓库。

**但要清楚它的边界**：`window-vibrancy` 在 Windows 上是分档实现的，
Win11（build ≥ 22523）走 `DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE)`，这条路径**忽略传入的 tint**。
所以 tint 只在 Windows 10 上真正起作用，Win11 的背景由系统主题决定。不要承诺"改 CSS 就能改 Win11 背景色"。

### 3. 命令必须放在 Rust 子模块里

`#[tauri::command]` 作用在 `pub fn` 上时会生成两个带 `#[macro_export]` 的宏，
而 `macro_export` 只能把宏放到 crate 根；紧接着宏还会生成一份 `pub use __cmd__xxx;`，
于是在根模块里「宏已存在」和「再导入一次」正面撞车，报 `E0255`，一条命令两个错误。

| 位置 | 可见性 | 能否编译 |
|---|---|---|
| crate 根（`main.rs` / `lib.rs`） | 私有 `fn` | 可以 |
| crate 根 | `pub fn` | **不行**，E0255 |
| 子模块（`commands.rs`） | `pub fn` | 可以 |

所以本 crate 的命令都在 `rust/src/commands.rs` 里，从 `lib.rs` 用 `pub mod commands;` 暴露，
且**不做 glob 重导出**（`pub use commands::*;` 会让冲突回到根模块）。下游引用路径是
`tauri_ui_kit::commands::xxx`。你自己的业务命令同理。

### 4. 桌面端的日志必须落盘

桌面端没有控制台，前端一抛异常，用户看到的就是白屏或"点了没反应"，拿不到任何信息。
所以套件里日志走三路：内存环形缓冲（供日志面板）、`console`（浏览器调试）、
`frontend.log`（进程崩了也能事后查）。`installErrorReporter()` 会把
`window.onerror` 与 `unhandledrejection` 全部接住并落盘。

## 四、平台支持

| 平台 | 后端 | 结果 |
|---|---|---|
| Windows 11 build ≥ 22523 | `DwmSetWindowAttribute(SYSTEMBACKDROP_TYPE)` | 生效。**传入的 tint 被忽略**，背景跟随系统主题 |
| Windows 10 build ≥ 17763 | `SetWindowCompositionAttribute(ACRYLICBLURBEHIND)` | 生效，tint 有效。已知拖动/缩放窗口会卡顿（上游用的非公开接口） |
| Windows 10 更低版本 | — | 返回错误 → 前端自动切兜底底色 |
| macOS | `NSVisualEffectMaterial::HudWindow` | 生效（**未实测**） |
| Linux | — | 无原生模糊 → 自动切兜底底色 |

`createShell` 的 `backdropBackend` 可选 `'acrylic'`（默认，与现有项目观感一致）、
`'mica'`（仅 Win11，走 DWM 原生，可避开上面那条拖动卡顿）、`'auto'`。
`useBackdrop: false` 可强制使用兜底底色。

运行日志里会打出实际走的后端和 Windows 构建号，排查"这台机器为什么没效果"时先看这一行。

## 五、目录

```
ui-kit/
├── README.md                 本文件：介绍与设计决策
├── docs/
│   ├── USAGE.md              使用文档：接入步骤、最小示例、场景、排查
│   ├── REFERENCE.md          参考：CSS 变量/类、JS API、Rust 命令
│   └── MIGRATION.md          迁移手册：从三个旧项目迁过来要改什么
├── src/
│   ├── index.css             样式入口，按 tokens → shell → glass 顺序聚合
│   ├── tokens.css            主题唯一真源
│   ├── shell.css             窗口骨架与背景策略
│   ├── glass.css             通用组件
│   ├── tauri.js              Tauri 桥接，浏览器里降级为桩函数
│   ├── ui.js                 日志、提示条、DOM 构造、格式化、事件总线、异常上报
│   ├── theme.js              原生背景的应用与生效探测
│   ├── shell.js              createShell：标题栏 + 导航 + 面板生命周期 + 路由
│   └── shell.template.html   窗口骨架模板
├── rust/                     独立 crate：tauri-ui-kit
├── scripts/check-docs.py     文档一致性检查，见下
└── demo/                     组件预览，不需要 Tauri、不需要构建
```

## 六、预览与自检

```bash
# 组件预览（不需要 Tauri、不需要构建）
python -m http.server 8899 --directory <本仓库路径>
# http://127.0.0.1:8899/demo/      加 ?blur=1 看玻璃效果

# 文档一致性检查：链接/锚点是否可解析、文档里写的 API 与 CSS 变量是否真实存在
python scripts/check-docs.py

# 原生侧编译校验
cargo check --manifest-path rust/Cargo.toml --offline
```

`demo/preview-blur.png` 是有原生模糊时的样子（背后是 demo 自己造的假桌面），
`demo/preview-fallback.png` 是没有原生模糊时的兜底样子。两者用的是同一套 CSS。

**改了代码或文档都要跑一遍 `check-docs.py`。** 它挡的是三类错误：内部链接失效、
锚点对不上（中文标题尤其容易）、以及文档里承诺了一个源码里并不存在的函数或 CSS 变量。

## 七、状态

已验证：

- `cargo check` 通过（离线，Windows 目标）
- 无头 Edge 实拍确认骨架、导航、角标、hash 路由、面板加载失败兜底、兜底底色、玻璃态透出

未验证 / 已知限制：

- macOS 与 Linux 没有实机跑过。macOS 分支的 `apply_vibrancy` 用的是 0.6 的四参数签名，能编译，但没跑过。
- Win10 上 acrylic 用非公开接口，拖动窗口可能卡顿；Win11 可改用 `mica`。
- `tauri.conf.json` 的 `csp` 建议不要留 `null`。需要放行非 `'self'` 资源时显式写策略。
- 三个旧项目的 `apply_vibrancy` 写的是 0.6 之前的两个参数版本；那段代码在
  `#[cfg(target_os = "macos")]` 下、又都没有 macOS 构建，所以"编译不过"这件事一直没暴露。
- `rust/Cargo.toml` 里同时出现在 `[dependencies]` 和 `[build-dependencies]` 的 `indexmap` 是**环境适配，别删**
  （`schemars` 的 E0107，详见 [docs/USAGE.md](docs/USAGE.md#5-依赖里的-indexmap-不是笔误)）。

---

© Rolling · MIT
