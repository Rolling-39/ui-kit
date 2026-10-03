# 使用文档

把 `@rolling/ui-kit` 接进一个 Tauri v2 桌面应用。按本文从头做完，能跑起来一个带完整窗口骨架的应用。

需要先读 [../README.md](../README.md) 了解"为什么背景默认不透明""为什么命令要放子模块"这几个设计决策 ——
本文只讲怎么做，不讲为什么。

## 目录

- [0. 前置条件](#0-前置条件)
- [1. 接入步骤](#1-接入步骤)
- [2. 最小完整示例](#2-最小完整示例)
- [3. 面板契约](#3-面板契约)
- [4. 常见场景](#4-常见场景)
- [5. 依赖里的 indexmap 不是笔误](#5-依赖里的-indexmap-不是笔误)
- [6. 排查手册](#6-排查手册)
- [7. 接入检查清单](#7-接入检查清单)

---

## 0. 前置条件

| 项 | 要求 |
|---|---|
| Tauri | v2 |
| Node | ≥ 18 |
| Rust | 能编 Tauri v2 的版本 |
| 本套件位置 | 与本项目在同一级目录，即 `<父目录>/ui-kit` 和 `<父目录>/你的项目`。路径要改的话见步骤 5 |

假设你的项目长这样（后文所有相对路径都以此为准）：

```
E:/AI_Coding_File/
├── ui-kit/                 ← 本套件
└── my-tool/
    ├── package.json
    ├── vite.config.js
    ├── src/
    └── src-tauri/
```

## 1. 接入步骤

七步，每步末尾都有验证方法。中途失败不要往下做，否则出错时很难判断是哪一步引入的。

### 步骤 1：装前端依赖

```bash
cd my-tool
npm install ../ui-kit
```

`package.json` 里会出现：

```json
"dependencies": {
  "@rolling/ui-kit": "file:../ui-kit"
}
```

**验证**：`ls node_modules/@rolling/ui-kit/src` 能看到 `tokens.css` 等文件。

### 步骤 2：放行 Vite 的符号链接

`file:` 依赖在 `node_modules` 里是符号链接，指向项目根目录之外。Vite 默认不跟随，
于是 `import '@rolling/ui-kit/index.css'` 会报解析失败。`vite.config.js`：

```js
import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src',
    build: { outDir: '../dist' },
    server: {
        port: 1420,
        strictPort: true,
        fs: { allow: ['..'] },   // 允许读取项目外的 ui-kit
    },
    resolve: { preserveSymlinks: false },
});
```

**验证**：`npm run dev` 不报 "Failed to resolve import"。

> 如果仍然解析不到，退而求其次：在 `vite.config.js` 里加别名
> `resolve: { alias: { '@rolling/ui-kit': fileURLToPath(new URL('../ui-kit/src', import.meta.url)) } }`，
> 然后 import 路径写成 `@rolling/ui-kit/index.css`。这条路不依赖 npm 的软链行为，最稳。

### 步骤 3：换掉页面骨架

把 `ui-kit/src/shell.template.html` 复制成 `my-tool/src/index.html`，替换其中的 `__APP_NAME__`（三处）。

导航按钮**不要手写**，`createShell` 会按面板清单生成。

注意三点：

- 不要在 `<html>` / `<body>` 上写内联 `style="background:transparent"`。背景策略由
  `shell.css` + `theme.js` 统一管，写死了就没法退回兜底底色。
- **保留 `<body>` 的第一个子元素 `<div class="backdrop-fallback" aria-hidden="true"></div>`**。
  它是原生模糊不可用时的兜底底色，删了会变成完全透明的窗口 + 0.15 不透明表面，文字糊在桌面上。
  `createShell` 在缺失时会自动补一层并在日志里提示，但那样首帧没有底色，仍可能闪一下。
- 保留 `id="sidebarNav"`、`id="content"`、`id="tbMin"`/`tbMax`/`tbClose`/`tbTitle`
  以及 `class="app"`、`class="titlebar"`、`data-tauri-drag-region` —— `createShell` 依赖这些钩子，
  缺了会直接抛错（错误信息会指向本模板）。

**验证**：先做步骤 4，一起验证。

### 步骤 4：写入口

```js
// src/main.js
import '@rolling/ui-kit/index.css';
import { createShell } from '@rolling/ui-kit/shell';

await createShell({
    appName: 'My Tool',
    panels: {
        home: { title: '主页', icon: 'H', load: () => import('./panels/home.js') },
        log:  { title: '日志', icon: 'L', load: () => import('./panels/log.js') },
    },
    defaultPanel: 'home',
});
```

**验证**：此时 `npm run dev` 应该能看到完整界面（标题栏 + 侧栏 + 内容区），
背景是不透明兜底色（因为还没接线原生侧，这是预期行为）。日志面板里应该有一行
`不在 Tauri 容器内，窗口背景使用不透明兜底`。

**在浏览器里就能开发到这一步**，这是这套 UI 的一个主要好处 —— 改样式不需要编 Rust。

### 步骤 5：加 Rust 依赖

`src-tauri/Cargo.toml`：

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-ui-kit = { path = "../../ui-kit/rust" }
window-vibrancy = "0.6"

# 环境适配，别删，见本文第 5 节
[build-dependencies]
indexmap = { version = "1.9", default-features = false, features = ["std", "serde-1"] }
```

**验证**：`cargo check --manifest-path src-tauri/Cargo.toml` 能过。

### 步骤 6：注册命令

`src-tauri/src/main.rs`：

```rust
#![windows_subsystem = "windows"]

use tauri::Manager;

fn main() {
    // 必须在 Builder 之前：它不依赖 AppHandle，白屏时靠这份日志判断执行到哪一步
    tauri_ui_kit::boot_log("my-tool", "启动", true);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 启动 2.5 秒后探测页面是否真的加载了，结果写进 frontend.log。
            // 第二个参数要和上面 boot_log 用的名字一致，否则两处日志分到不同文件。
            tauri_ui_kit::spawn_ready_probe(app.handle(), "my-tool", "main", 2500);
            tauri_ui_kit::boot_log("my-tool", "setup 完成", false);
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

两个必须遵守的点：

- **不要在 `.setup()` 里直接调 `apply_acrylic`。** 前端会通过 `ui_kit_apply_backdrop` 统一应用，
  这样"生效没生效"才有回报，也才能退回兜底底色。
- 你自己的业务命令如果写成 `pub fn`，**必须放进子模块**（例如 `mod commands;`），
  否则报 `E0255`。写成私有 `fn` 放 `main.rs` 也可以。

**验证**：`npm run dev` 启动后，标题栏右上角三个按钮生效（最小化/最大化/关闭），
日志面板出现 `原生窗口背景已生效：acrylic（tint 245,250,248,96）` 之类的行。

### 步骤 7：窗口配置与能力清单

`src-tauri/tauri.conf.json`：

```json
{
  "productName": "My Tool",
  "version": "1.0.0",
  "identifier": "com.rolling.my-tool",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npx vite",
    "beforeBuildCommand": "npx vite build"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "My Tool",
        "width": 1180,
        "height": 760,
        "minWidth": 940,
        "minHeight": 600,
        "decorations": false,
        "transparent": true
      }
    ],
    "security": { "csp": null }
  }
}
```

- `withGlobalTauri: true` 是**必需**的，`tauri.js` 靠运行时注入的 `window.__TAURI__` 工作。
- `decorations: false` + `transparent: true` 也是必需的，否则原生背景无从透出。
  `transparent: true` 在无模糊平台上是安全的 —— 那时 `<html>` 有兜底底色，不会透出桌面。
- `minWidth`/`minHeight` 按需；标题栏高度 36px、侧栏 220px（窄屏 < 1400px 时）。

`src-tauri/capabilities/default.json`：

```json
{
  "identifier": "default",
  "description": "Default capability for My Tool",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save"
  ]
}
```

窗口控制走自定义命令，所以**不需要** `core:window`；也**不需要** `fs` 插件权限
（套件不读写文件，文件 IO 由你自己的 Rust 命令做，或按需另开 `fs` 插件）。

**验证**：`npm run build`，运行产出的 exe，背景应该是真正透出桌面的模糊效果。

## 2. 最小完整示例

按上一节做完之后，项目里应该长这样。**加粗**的是你写的，其余是模板/配置。

```
my-tool/
├── package.json                      依赖含 "@rolling/ui-kit": "file:../ui-kit"
├── vite.config.js                    server.fs.allow + preserveSymlinks
├── src/
│   ├── index.html                    ← 复制自 shell.template.html
│   ├── main.js                       ← createShell
│   └── panels/
│       └── home.js                   ← 业务面板
└── src-tauri/
    ├── Cargo.toml                    tauri-ui-kit + indexmap
    ├── tauri.conf.json               decorations:false + transparent:true
    ├── capabilities/default.json     core:default + dialog
    └── src/main.rs                   注册 7 个命令
```

`src/panels/home.js`：

```js
import { el, log, snack, timer, fmtSize } from '@rolling/ui-kit/ui';
import { openDialog } from '@rolling/ui-kit/tauri';

export function mount(root) {
    const status = el('span', { class: 'label', text: '未选择文件' });
    let picked = null;

    root.append(
        el('div', { class: 'card' }, [
            el('div', { class: 'card-header', text: '选择文件' }),
            el('div', { class: 'btn-row' }, [
                el('button', {
                    class: 'btn btn-primary',
                    text: '选择文件',
                    onClick: async () => {
                        const p = await openDialog({ multiple: false });
                        if (!p) return;
                        picked = p;
                        status.textContent = p.split(/[\\/]/).pop();
                        log('已选择：' + p);
                        snack('已选择');
                    },
                }),
                el('button', {
                    class: 'btn btn-outline',
                    text: '处理',
                    onClick: async () => {
                        if (!picked) return snack('请先选择文件', 'err');
                        const t = timer();
                        const size = await invoke('file_size', { path: picked });
                        status.textContent = fmtSize(size) + '｜' + t.text();
                    },
                }),
            ]),
            status,
        ]),
    );

    log('主页已挂载');
    return {};
}
```

`invoke` 从 `@rolling/ui-kit/tauri` 取：

```js
import { invoke } from '@rolling/ui-kit/tauri';
```

## 3. 面板契约

面板模块导出一个 `mount`，返回可选的 `destroy` / `refresh`：

```js
export function mount(root) {
    // root 是一个空的 <section class="panel active">，直接往里塞界面
    return {
        // 切走前被 await。停定时器、退订、停系统级监听线程都放这里
        destroy() {},
        // 由 shell.refresh() 调用，用于重新读取数据
        refresh() {},
    };
}
```

`mount` 可以是 `async`，`destroy` 也可以。

**`destroy` 不是可选项。** 面板里起的系统级监听（比如 Keypad 那个 Raw Input 线程）、
定时器、`on()` 订阅，不显式停掉都会在后台继续跑：切一次面板多一个，用户看不出问题，
直到机器变卡或者回调打到已经卸载的 DOM 上。

正确写法：

```js
import { on } from '@rolling/ui-kit/ui';

export function mount(root) {
    const timerId = setInterval(poll, 1000);
    const off = on('device-changed', refresh);

    // …建界面…

    return {
        destroy() {
            clearInterval(timerId);
            off();
        },
    };
}
```

面板清单里每一项可以是：

| 字段 | 说明 |
|---|---|
| `title` | 必填，导航文字，也会拼进窗口标题 `应用名 - 面板名` |
| `icon` | 可选，导航左侧图标位（用字符，不是图片） |
| `badge` | 可选，导航右侧角标初始值，之后用 `shell.setBadge(key, n)` 改 |
| `hidden` | 可选，为 `true` 时不出现在导航里，但仍然可以被 `showPanel` 打开 |
| `load` | 懒加载：`() => import('./panels/xxx.js')`，第一次切到才下载 |
| `mount` | 内联实现，和 `load` 二选一 |

`createShell` 返回的对象：

| 成员 | 说明 |
|---|---|
| `activeName` | 当前面板名（getter） |
| `showPanel(name)` | 切换面板，会先 `await` 上一个面板的 `destroy()` |
| `refresh()` | 调用当前面板的 `refresh()` |
| `setBadge(key, value)` | 设置导航角标，传 `null` 移除 |
| `panels` | 面板清单 |

`createShell` 的选项：

| 选项 | 默认 | 说明 |
|---|---|---|
| `appName` | `'App'` | 用于窗口标题 |
| `sidebarTitle` | = `appName` | 侧栏顶部的标题 |
| `footer` | `'© Rolling'` | 侧栏底部 |
| `panels` | 必填 | 见上表 |
| `defaultPanel` | 清单第一项 | 默认打开哪个 |
| `backdropBackend` | `'acrylic'` | `'acrylic'` / `'mica'`（仅 Win11）/ `'auto'` |
| `useBackdrop` | `true` | 置 `false` 强制用不透明兜底底色 |
| `onReady` | `null` | `createShell` 完成后的回调，参数是 shell 对象 |

## 4. 常见场景

### 4.1 长任务：进度条与取消

Rust 侧用 `AtomicBool` 做取消位，`spawn_blocking` 跑阻塞体，`app.emit` 报进度：

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

static CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn process_file(app: tauri::AppHandle, path: String) -> Result<u64, String> {
    // 关键：在每个长任务入口清标志位，别让调用方去记
    CANCEL.store(false, Ordering::SeqCst);
    tokio::task::spawn_blocking(move || {
        // …每处理一块就检查一次…
        if CANCEL.load(Ordering::SeqCst) { return Err("已取消".into()); }
        let _ = app.emit("process-progress", serde_json::json!({"percent": 42}));
        Ok(0)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_process() { CANCEL.store(true, Ordering::SeqCst); }
```

前端：

```js
import { el, log, timer } from '@rolling/ui-kit/ui';
import { invoke, listen } from '@rolling/ui-kit/tauri';

const fill = el('div', { class: 'progress-fill', style: 'width:0%' });
const pct  = el('span', { class: 'label', text: '0%' });
const elapsed = el('span', { class: 'label', text: '' });
const t = timer();

const off = await listen('process-progress', (e) => {
    fill.style.width = e.payload.percent + '%';
    pct.textContent = e.payload.percent + '%';
    elapsed.textContent = t.text();
});

try {
    await invoke('process_file', { path });
} finally {
    off();   // 一定要退订，否则每次重跑都叠一个回调
}
```

进度条结构固定是 `.progress-bar > .progress-fill`。

### 4.2 批量：双层进度与结果列表

上层 `.progress-bar` 走文件数（N/M），下层走当前文件百分比。结果逐条追加到 `.result-list`：

```js
import { el } from '@rolling/ui-kit/ui';

const list = el('div', { class: 'result-list' });

function addResult(name, ok, msg) {
    list.appendChild(el('div', { class: 'result-item ' + (ok ? 'success' : 'fail') }, [
        el('span', { class: 'icon', text: ok ? 'OK' : '!!' }),
        el('span', { class: 'name', text: name }),
        el('span', { class: 'msg', text: msg }),
    ]));
}
```

**不要用 `list.innerHTML += ...` 追加。** 两个原因：每次都整段重新解析（列表长时肉眼可见变慢），
以及文件名来自文件系统或设备，拼进 HTML 就是注入面。用 `el()` + `textContent`。

另外注意：批量的输出文件名如果可能和输入重名，写之前先判断，否则会静默覆盖原文件。

### 4.3 浏览器里开发调试

`tauri.js` 在检测不到 `window.__TAURI__` 时把所有调用降级：
`invoke` 会 reject，`openDialog`/`saveDialog` 返回 `null`，窗口控制变成空操作。
所以整套界面可以直接在 Chrome 里跑，改样式不用编 Rust。

想让界面有数据，自己提供一份 mock 并把 `invoke` 换掉：

```js
// src/mock.js
const CANNED = { list_devices: () => [{ path: 'demo-1', product: '虚拟设备' }] };

export function mockInvoke(cmd, args) {
    const fn = CANNED[cmd];
    if (!fn) return Promise.reject(new Error('mock 未实现：' + cmd));
    return Promise.resolve(fn(args));
}
```

```js
// src/main.js
import { isTauri, invoke } from '@rolling/ui-kit/tauri';
import { mockInvoke } from './mock.js';

const call = (cmd, args) => (isTauri ? invoke(cmd, args) : mockInvoke(cmd, args));
```

**mock 只放数据，不要在里面重新实现业务逻辑。** 否则两份实现会各自演化，最后 mock 的通过不代表真机通过。

### 4.4 换主题色

只改 `ui-kit/src/tokens.css`（或在你项目里覆盖同名变量）：

```css
:root { --primary-rgb: 55, 138, 221; }   /* 换成蓝色 */
```

字号、圆角、字体、阴影同理，全部在这一节。改完不需要动 Rust。

改完记得在原生侧也调一次 `refreshBackdrop()`，让 tint 重新读一遍（仅 Win10 有意义）。

### 4.5 状态卡片（侧栏）

`shell.template.html` 里侧栏底部预留了位置。要放设备状态/连接状态的卡片，
在骨架里加一个容器，用 `.device-card` / `.device-line` / `.dot` 这几个类，
然后在 `onReady` 里更新：

```js
await createShell({
    // …
    onReady(shell) {
        const dot = document.getElementById('dotStatus');
        dot.className = 'dot on';     // .dot.on 在线 / .dot.warn 待确认 / .dot.off 离线
    },
});
```

## 5. 依赖里的 indexmap 不是笔误

`ui-kit/rust/Cargo.toml` 里 `indexmap` 同时出现在 `[dependencies]` 和 `[build-dependencies]`，
这是环境适配，**删掉会直接编译失败**：

```
error[E0107]: struct takes 3 generic arguments but 2 generic arguments were supplied
  --> schemars-0.8.22/src/lib.rs:12:32
```

`schemars`（tauri 的传递依赖）在开启 `preserve_order` 时写的是 indexmap 1.x 的
`IndexMap<K, V>` 两参数形式，只有 indexmap 的 `std` 特性开启时 `S` 才有默认值。
indexmap 1.9 的 `build.rs` 用 autocfg 探测 std，在本机环境下探测不到，于是整个依赖树编译不过。

两处都必须声明，因为 resolver v2 对构建期依赖与普通依赖的特性分开解析：
indexmap 被构建期那侧（tauri → tauri-build → schemars）和普通依赖侧各拉了一份，只写一处不生效。

由 `ui-kit` 声明之后，**下游应用不必再处理这个问题**。但如果你的应用有自己的 `build.rs`
（Tauri 项目都有），`[build-dependencies]` 那一份仍然建议照抄。

同理，`window-vibrancy` 必须是真的依赖而不是靠 `tauri-ui-kit` 转出去 —— 因为
`ui_kit_clear_backdrop` 之外的平台分支里也引用了它的类型。

## 6. 排查手册

### 界面白屏 / 什么都没有

桌面端没有控制台，所以先看两份日志：

1. `%TEMP%\my-tool-boot.log` —— 由 `boot_log` 写，能确认执行到哪一步。
   只有"启动"没有"setup 完成" → 事件循环没起来，不是前端问题。
2. `<app_config_dir>\frontend.log` —— 由 `js_log` / `installErrorReporter` 写。
   里面有 `[error]`/`[reject]` 行 → 前端脚本抛异常了，行号和文件名会写在里面。
   Windows 下 `app_config_dir` 通常是 `%APPDATA%\com.rolling.my-tool\`。

日志面板里也会写 `[rust] 窗口 url = ... ，页面探测 = ok/失败`，这句能区分
"WebView 没加载到页面"和"页面加载了但脚本报错"。

### 窗口透明，文字看不清 / 糊在桌面上

说明原生模糊没生效，而兜底底色也没起来。检查顺序：

1. 日志面板里那句话是 `原生窗口背景已生效：xxx` 还是 `原生窗口背景不可用，已切换为不透明兜底：xxx`。
   后者的 `detail` 会说明原因（平台不支持 / API 报错）。
2. `applied: false` 时 `<html>` **不应该**有 `backdrop-ok` 类。在 DevTools 里确认一下。
3. 确认 `<body>` 第一个子元素是 `<div class="backdrop-fallback">`。
   没有它就没有兜底底色，窗口会变成"完全透明 + 0.15 不透明表面"，正是这个症状。
4. 如果你照抄了某个旧项目的内联 `style="background:transparent!important"`，删掉它 ——
   它会把兜底底色一起干掉。

### 原生模糊在有的机器上没效果

看日志里打出的 Windows 构建号。build < 17763 的系统不支持 acrylic，会自动走兜底。
build 在 17763 到 22522 之间走的是 SWCA（非公开接口），拖动窗口可能卡顿，属已知问题。

### `E0255: __cmd__xxx is defined multiple times`

你自己的命令写成 `pub fn` 又放在了 crate 根模块。两个办法：
改成私有 `fn`，或者移进 `commands.rs` 之类的子模块（推荐，见 [README](../README.md#3-命令必须放在-rust-子模块里)）。
注意子模块**不要**用 `pub use commands::*;` 重导出，那样冲突会回到根模块。

### `Failed to resolve import "@rolling/ui-kit/index.css"`

`file:` 依赖的软链没被 Vite 跟随。检查 `vite.config.js` 里的
`server.fs.allow` 和 `resolve.preserveSymlinks`；仍不行就用 4.2 节末尾说的别名方案。

### 面板打不开，显示"面板加载失败"

面板 `mount()` 里抛异常了，异常内容会直接显示在那张卡片上，同时写进 `frontend.log`。
最常见的原因是面板在 `mount` 阶段就访问了还没入 DOM 的元素：
`el()` 创建的元素在 `root.append(...)` 之前是孤立的，`nextElementSibling`、
`parentNode` 之类的属性都还是 `null`。

### cargo 报连不上 crates.io

`Could not connect to server ... via 127.0.0.1` 说明走了系统代理。
在 `src-tauri/.cargo/config.toml` 里加：

```toml
[http]
proxy = ""
```

## 7. 接入检查清单

复制这份清单逐条打勾。任何一条没过就发布，出的问题都会很难查。

- [ ] `npm install ../ui-kit` 成功，`node_modules/@rolling/ui-kit/src` 存在
- [ ] `vite.config.js` 里有 `server.fs.allow: ['..']` 与 `resolve.preserveSymlinks: false`
- [ ] `src/index.html` 来自 `shell.template.html`，`<body>` 第一个子元素是 `.backdrop-fallback`，且**没有**内联 `background:transparent`
- [ ] `src/index.html` 里 `sidebarNav` / `content` / `tbMin` / `tbMax` / `tbClose` / `tbTitle` 六个 id 齐全
- [ ] `main.js` 第一行 import 了 `@rolling/ui-kit/index.css`，且在项目自己的样式**之前**
- [ ] `Cargo.toml` 里有 `tauri-ui-kit`（path 正确）和两处 `indexmap`
- [ ] `main.rs` 没有在自己的 `setup` 里调 `apply_acrylic`
- [ ] `main.rs` 注册了全部 7 个命令
- [ ] 自己的 `pub fn` 命令都在子模块里，或都是私有 `fn`
- [ ] `tauri.conf.json` 有 `withGlobalTauri: true`、`decorations: false`、`transparent: true`
- [ ] `capabilities/default.json` 只有 `core:default` + 你真正用到的插件权限
- [ ] 每个面板的 `mount` 都返回了 `destroy`（至少处理定时器与订阅）
- [ ] 所有 `listen()` 都配了对应的退订
- [ ] 在**没有**原生模糊的假设下检查过一遍界面是否可读（把 `--backdrop-fallback` 临时改成刺眼的颜色测）
- [ ] `npm run build` 产出的 exe 实机跑过一遍，不是只跑了 `npm run dev`
