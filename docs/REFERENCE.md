# 参考

CSS 变量、CSS 类、JS 模块、Rust 命令的速查。想先跑起来看 [USAGE.md](USAGE.md)。

## 目录

- [一、CSS 变量](#一css-变量)
- [二、CSS 类](#二css-类)
  - [布局骨架](#布局骨架)
  - [卡片与标题](#卡片与标题)
  - [按钮](#按钮)
  - [表单](#表单)
  - [标签与徽标](#标签与徽标)
  - [数据展示](#数据展示)
  - [进度与加载](#进度与加载)
  - [提示条](#提示条)
  - [状态类](#状态类)
- [三、JS 模块](#三js-模块)
  - [`@rolling/ui-kit/ui`](#rollingui-kitui)
  - [`@rolling/ui-kit/tauri`](#rollingui-kittauri)
  - [`@rolling/ui-kit/theme`](#rollingui-kittheme)
  - [`@rolling/ui-kit/shell`](#rollingui-kitshell)
- [四、Rust](#四rust)
- [五、可复制片段](#五可复制片段)

---

## 一、CSS 变量

全部定义在 `src/tokens.css`。改主题只改这个文件，原生侧不需要重新编译。

### 颜色

用 `R, G, B` 三元组定义，再由 `rgb()` 派生 —— 这样需要透明度的场合可以直接
`rgba(var(--primary-rgb), 0.15)`，不需要到处抄一遍色值。

| 变量 | 浅色 | 深色 | 说明 |
|---|---|---|---|
| `--primary-rgb` | `57, 197, 187` | `74, 218, 208` | 品牌色。**要改就改这一个** |
| `--primary` | `rgb(var(--primary-rgb))` | 同左 | 派生，别直接改 |
| `--primary-container` | `rgba(var(--primary-rgb), 0.15)` | 同左 | 悬停底色 |
| `--on-primary` | `#003734` | 同左 | 品牌色上的文字 |
| `--success-rgb` | `29, 158, 117` | 同左 | |
| `--danger-rgb` | `226, 75, 74` | 同左 | |
| `--warn-rgb` | `186, 117, 23` | 同左 | |
| `--info-rgb` | `55, 138, 221` | 同左 | |
| `--success` / `--danger` / `--warn` / `--info` | 由上面派生 | 同左 | |

### 表面与描边

| 变量 | 浅色 | 深色 |
|---|---|---|
| `--surface` | `rgba(250, 253, 251, 0.18)` | `rgba(25, 28, 28, 0.52)` |
| `--surface-glass` | `rgba(250, 253, 251, 0.15)` | `rgba(25, 28, 28, 0.50)` |
| `--surface-glass-strong` | `rgba(250, 253, 251, 0.30)` | `rgba(25, 28, 28, 0.68)` |
| `--surface-variant` | `rgba(218, 229, 226, 0.12)` | `rgba(63, 73, 70, 0.35)` |
| `--on-surface` | `#191C1C` | `#E0E3E1` |
| `--on-surface-variant` | `#3F4946` | `#BEC9C6` |
| `--outline` | `rgba(111, 121, 118, 0.3)` | `rgba(137, 147, 144, 0.35)` |

不透明度改小 = 更透（原生模糊更明显），改大 = 更实（文字更清楚）。
没有原生模糊时要靠兜底底色保证可读性，别把表面做得太透。

### 窗口背景

| 变量 | 浅色 | 深色 | 说明 |
|---|---|---|---|
| `--backdrop-tint` | `245, 250, 248, 96` | `18, 18, 18, 64` | 格式 `r, g, b, a`，a 为 0-255。**仅 Windows 10 生效**，Win11 会忽略 |
| `--backdrop-fallback` | 浅色渐变 | 深色渐变 | 原生模糊不可用时的底色，**必须不透明** |

### 尺寸、字体、阴影

| 变量 | 值 |
|---|---|
| `--radius` / `--radius-sm` / `--radius-pill` | `14px` / `10px` / `28px` |
| `--sidebar-w` | `220px`（≥1400px 时 260px） |
| `--transition` | `0.2s ease` |
| `--font` | `system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif` |
| `--mono` | `'Cascadia Code', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace` |
| `--shadow` / `--shadow-lg` / `--shadow-primary` | |

## 二、CSS 类

### 布局骨架

由 `shell.template.html` 提供，一般不需要动。

| 类 | 说明 |
|---|---|
| `.app` | 最外层纵向 flex，撑满视口 |
| `.titlebar` | 自定义标题栏，36px，`-webkit-app-region: drag`。配合 `data-tauri-drag-region` |
| `.titlebar-title` / `.titlebar-controls` | 标题文字 / 右侧按钮容器（`no-drag`） |
| `.tb-btn` / `.tb-close` | 标题栏按钮；`.tb-close` 悬停变红 |
| `.app-body` | 标题栏下方的横向 flex |
| `.sidebar` / `.sidebar-title` / `.sidebar-nav` / `.sidebar-footer` | 侧栏 |
| `.nav-item` / `.nav-icon` / `.nav-badge` | 导航项 / 图标位 / 角标。`createShell` 自动生成，不要手写 |
| `.content` | 内容区，自带装饰性光斑（给原生模糊当模糊源） |
| `.panel` / `.panel.active` | 面板容器；只有 `.active` 可见 |
| `html.backdrop-ok` | 由 `theme.js` 在确认原生模糊生效后添加；加了这个类表面才透明 |

### 卡片与标题

```html
<div class="card">
  <div class="card-header">分组标题</div>
  内容
</div>
```

`.card` 玻璃底 + 0.5px 描边 + 圆角 + 阴影。`.card-header` 小号灰色标题，`uppercase`（中文无影响）。

### 按钮

```html
<div class="btn-row">
  <button class="btn btn-primary">主要</button>
  <button class="btn btn-tonal">色调</button>
  <button class="btn btn-outline">描边</button>
  <button class="btn btn-text">文字</button>
  <button class="btn btn-danger">危险</button>
  <button class="btn btn-sm btn-outline">小号</button>
  <button class="btn btn-primary" disabled>禁用</button>
</div>

<!-- 等宽撑满 -->
<div class="btn-row fill">
  <button class="btn btn-primary">左</button>
  <button class="btn btn-outline">右</button>
</div>
```

| 类 | 用途 |
|---|---|
| `.btn` | 基础：胶囊形、`--radius-pill`、500 字重 |
| `.btn-primary` | 实心品牌色 + 阴影，主操作 |
| `.btn-tonal` | 品牌色 85% 不透明度，次一级主操作 |
| `.btn-outline` | 透明底 + 品牌色描边 |
| `.btn-text` | 纯文字，用于"取消""清空"这类弱操作 |
| `.btn-danger` | 实心红，破坏性操作 |
| `.btn-sm` | 内边距和字号缩小，用于表格行内 |
| `.btn-row` | 按钮行，默认**不拉伸**（`flex: 0 1 auto`） |
| `.btn-row.fill` | 按钮等宽撑满（旧 Base64 项目的 `.btn-row` 行为，迁移时要加 `fill`） |

`:disabled` 统一降到 0.4 不透明度并禁用指针事件。

### 表单

```html
<div class="field">
  <span class="label label-strong">字段名</span>
  <input class="input" placeholder="单行" />
</div>

<div class="field">
  <span class="label label-strong">说明</span>
  <textarea class="textarea" placeholder="多行，等宽字体"></textarea>
</div>

<div class="field">
  <span class="label label-strong">选项</span>
  <select class="select">
    <option>一</option>
  </select>
</div>

<input class="range" type="range" min="0" max="100" />
<input class="input input-narrow" value="90" />
```

| 类 | 说明 |
|---|---|
| `.input` / `.textarea` / `.select` | 统一玻璃底 + 0.5px 描边；`:focus` 变品牌色 + 3px 光晕 |
| `.textarea` | 多行，最小高 100px，可纵向拉伸 |
| `.select` | 光标手型，字体用 `--font`；展开面板是系统绘制的，已显式给深色底 |
| `.range` | 用 `accent-color: var(--primary)` 上色 |
| `.input-narrow` | 宽度收到 90px |
| `.field` | 纵向字段组，内部 `.label` 自动加粗 |
| `.toggle-group` > `.toggle-btn` | 分段开关（二选一/多选一） |

分段开关：

```html
<div class="toggle-group">
  <button class="toggle-btn active">加密</button>
  <button class="toggle-btn">解密</button>
</div>
```

### 标签与徽标

```html
<div class="chip-row">
  <span class="chip on">已选</span>
  <span class="chip">未选</span>
  <span class="bind-chip">Ctrl + A</span>
  <span class="bind-chip none">未绑定</span>
</div>

<span class="badge">默认</span>
<span class="badge ok">成功</span>
<span class="badge warn">警告</span>
<span class="badge err">错误</span>

<span class="dot on"></span> 在线
<span class="dot warn"></span> 待确认
<span class="dot off"></span> 离线
```

| 类 | 状态变体 |
|---|---|
| `.chip` | `.on` 选中态 |
| `.bind-chip` | `.none` 未绑定（灰） |
| `.badge` | `.ok` / `.warn` / `.err` |
| `.dot` | `.on`（在线，品牌色）/ `.warn` / `.off` |

`.dot` 单独用是个 8px 圆点。`.dot.on` 保持品牌色而不是绿色 —— 这是刻意的，
换色属于视觉变更，要在实机上确认过再改。

### 数据展示

```html
<div class="stat-grid">
  <div class="stat">
    <div class="k">文件大小</div>
    <div class="v">18.4<span class="u">MB</span></div>
  </div>
</div>

<div class="kv"><span class="k">输入</span><span class="v">a.txt</span></div>
<div class="kv"><span class="k">输出</span><span class="v">a.txt.txt</span></div>

<div class="result-scroll">等宽字体的长文本结果区，可选中复制</div>

<div class="result-list">
  <div class="result-item success">
    <span class="icon">OK</span>
    <span class="name">photo.png</span>
    <span class="msg">860 KB → 1.15 MB</span>
  </div>
  <div class="result-item fail">
    <span class="icon">!!</span>
    <span class="name">broken.jpg</span>
    <span class="msg">解码失败</span>
  </div>
</div>

<img class="result-image" src="..." />

<div class="empty-state">这里还没有数据</div>
```

| 类 | 说明 |
|---|---|
| `.stat-grid` | `auto-fit minmax(112px, 1fr)` 自适应网格 |
| `.stat` `.k` `.v` `.u` | 指标卡片：标签 / 20px 数值 / 小号单位 |
| `.kv` `.k` `.v` | 键值行，底部分隔线（最后一行自动去掉） |
| `.result-scroll` | 等宽、可滚动、可选中、保留空白与换行 |
| `.result-list` / `.result-item` | 结果列表；`.success` 左侧绿边，`.fail` 左侧红边 |
| `.result-image` | 受限于 340px 高、宽度撑满、`object-fit: contain` |
| `.empty-state` | 居中灰字空状态 |

### 进度与加载

```html
<div class="progress-bar"><div class="progress-fill" style="width:42%"></div></div>

<div class="loading-row show">
  <span class="spinner"></span>
  <span class="label">处理中…</span>
</div>
```

| 类 | 说明 |
|---|---|
| `.progress-bar` | 6px 高轨道 |
| `.progress-fill` | 填充条，`width` 由 JS 控制；有 `0.2s` 过渡 |
| `.spinner` | 18px 旋转圈，`spin` 关键帧 |
| `.loading-row` | 默认 `display:none`，加 `.show` 显示 |

### 提示条

由 `snack()` 动态创建，不需要手写 HTML：

```js
import { snack, snackErr, snackWarn } from '@rolling/ui-kit/ui';
snack('已保存');              // 品牌色
snackErr('写入失败：文件被占用');  // 红
snackWarn('有 3 项被跳过');     // 橙
```

固定底部居中，2.6 秒后自动移除；同屏只保留一条（新的会顶掉旧的）。

### 状态类

通用文字与间距工具：

| 类 | 说明 |
|---|---|
| `.label` / `.label-primary` / `.label-strong` | 12px 次要文字 / 品牌色 / 加粗 |
| `.hint` | 12px 说明文字，行高 1.7 |
| `.mono` | 等宽字体 |
| `.ok-text` / `.err-text` / `.warn-text` | 语义文字色 |
| `.status-line` | 两端对齐的状态行（左边说明、右边耗时） |

## 三、JS 模块

四个模块，按需 import。全部是原生 ES 模块。

### `@rolling/ui-kit/ui`

```js
import { el, snack, log, timer, fmtSize } from '@rolling/ui-kit/ui';
```

#### DOM

| 导出 | 签名 | 说明 |
|---|---|---|
| `el` | `el(tag, attrs?, children?) → HTMLElement` | 建元素。`attrs` 特殊键：`class`、`text`（= `textContent`）、`html`（= `innerHTML`）、`dataset`（对象）、`onXxx`（事件，函数）、`true`（无值属性） |
| `$` | `$(id) → HTMLElement \| null` | `getElementById` |
| `$$` | `$$(selector, root?) → HTMLElement[]` | `querySelectorAll` 转数组 |
| `clear` | `clear(node) → node` | 清空子节点并返回该节点，便于链式 |

`el()` 是为了替代 `innerHTML` 字符串拼接：字符串拼 HTML 在插入文件名、设备返回的字符串这类
外部数据时会引入注入面，而且拼错了不报错，只会静默少一段界面。

```js
const row = el('div', { class: 'result-item success' }, [
    el('span', { class: 'name', text: fileName }),   // 自动转义
    el('button', { class: 'btn btn-sm btn-outline', text: '打开', onClick: () => open() }),
]);
```

#### 提示条（snack）

| 导出 | 签名 |
|---|---|
| `snack` | `snack(msg, kind = 'ok', dur = 2600)`，`kind`: `'ok'` / `'err'` / `'warn'` |
| `snackErr` | `snackErr(msg, dur?)` |
| `snackWarn` | `snackWarn(msg, dur?)` |

#### 日志

| 导出 | 说明 |
|---|---|
| `log(msg)` | 写内存缓冲（上限 2000 行）、通知订阅者、写 `console` |
| `logPersist(msg)` | 同 `log`，另外落盘到 `frontend.log`。启动阶段与错误路径用它 |
| `logText()` | 取全部日志文本 |
| `clearLog()` | 清空 |
| `onLog(fn)` | 订阅，`fn(line, lines)`；返回取消订阅函数 |
| `installErrorReporter()` | 接管 `window.onerror` 与 `unhandledrejection`，并暴露 `window.__uiKitReport`（原生侧探活用）。`createShell` 会自动调 |

#### 格式化

| 导出 | 签名 | 示例 |
|---|---|---|
| `fmtSize` | `fmtSize(bytes)` | `0 B` / `1.5 KB` / `2.00 GB` |
| `fmtTime` | `fmtTime(ms)` | `2026-10-03 21:29:33` |
| `fmtDuration` | `fmtDuration(ms)` | `2.1s` / `1m35s` |
| `timer` | `timer()` | 返回 `{ ms, sec, text() }`，`text()` 给 `fmtDuration` 的格式 |

```js
const t = timer();
await doWork();
status.textContent = t.text();
```

#### 事件总线

| 导出 | 说明 |
|---|---|
| `on(evt, fn)` | 订阅，返回取消订阅函数 |
| `emit(evt, payload)` | 广播；单个订阅者抛异常不影响其他订阅者，异常会进日志 |

面板之间不直接互相调用，一律走总线。`on()` 一律返回取消函数，**面板的 `destroy` 里要调用它**。

### `@rolling/ui-kit/tauri`

```js
import { isTauri, invoke, listen, openDialog, saveDialog } from '@rolling/ui-kit/tauri';
```

| 导出 | 浏览器中的行为 |
|---|---|
| `isTauri` | `false` |
| `invoke(cmd, args?)` | reject（`未在 Tauri 环境中运行`） |
| `invokeOr(fallback, cmd, args?)` | resolve 兜底值，不抛错 |
| `listen(event, cb)` | resolve 空函数 |
| `openDialog(options?)` | `null` |
| `saveDialog(options?)` | `null` |
| `minimizeWindow()` / `toggleMaximizeWindow()` / `closeWindow()` | 空操作 |
| `jsLog(text)` | 空操作 |
| `frontendLogPath()` | `''` |
| `applyBackdrop(tint, backend?)` | `{ applied: false, backend: 'browser', ... }` |

`invokeOr` 适合"取一个可选信息，失败就用默认值"的场合，省一次 try/catch。

### `@rolling/ui-kit/theme`

```js
import { initBackdrop, isBackdropActive, refreshBackdrop, watchColorScheme, readBackdropTint } from '@rolling/ui-kit/theme';
```

| 导出 | 说明 |
|---|---|
| `readBackdropTint()` | 读 `--backdrop-tint`，返回 `[r,g,b,a]` 或 `null` |
| `initBackdrop({ backend?, force? })` | 应用原生背景并据结果加/去 `html.backdrop-ok`；`force: false` 强制兜底 |
| `isBackdropActive()` | 原生模糊当前是否生效 |
| `watchColorScheme(fn?)` | 监听系统亮/暗色切换并重新取 tint 应用；返回停止函数 |
| `refreshBackdrop(backend?)` | 手动重设（例如换主色后） |

`createShell` 已经调了 `initBackdrop` 和 `watchColorScheme`。只有你要自己控制时机时才直接用这两个。

### `@rolling/ui-kit/shell`

```js
import { createShell } from '@rolling/ui-kit/shell';
```

`createShell(options) → Promise<shell>`。选项与返回值见 [USAGE.md 第 3 节](USAGE.md#3-面板契约)。

它依次做这些事：校验骨架（缺东西会抛错并指向模板）→ 装异常上报 → 绑定标题栏 →
按面板清单生成导航 → 应用原生背景 → 打启动日志 → 打开默认面板（或 hash 指定的）→ 调 `onReady`。

## 四、Rust

crate 名 `tauri-ui-kit`。命令在 `tauri_ui_kit::commands`，辅助函数在 `tauri_ui_kit` 根。

### 命令

| 命令 | 参数 | 返回 |
|---|---|---|
| `ui_kit_apply_backdrop` | `tint: Option<(u8,u8,u8,u8)>`, `backend: Option<String>` | `BackdropReport` |
| `ui_kit_clear_backdrop` | — | `Result<(), String>` |
| `minimize_window` | — | `Result<(), String>` |
| `toggle_maximize_window` | — | `Result<(), String>` |
| `close_app_window` | — | `Result<(), String>` |
| `js_log` | `text: String` | `Result<(), String>` |
| `frontend_log_path` | — | `Result<String, String>` |

`BackdropReport`：

```rust
pub struct BackdropReport {
    pub applied: bool,        // 原生模糊是否真的生效
    pub backend: String,      // "acrylic" / "mica" / "vibrancy" / "none"
    pub os_build: Option<u32>,// Windows 构建号，排查用
    pub detail: String,       // 失败原因或注意事项
}
```

`backend` 取值：`"acrylic"`（默认）/ `"mica"`（仅 Win11）/ `"auto"`（Win11 用 mica，其余 acrylic）。

`applied: false` 时**前端必须保持不透明兜底底色**，`theme.js` 已经这么做了。自己接的话别漏。

### 辅助函数

| 函数 | 说明 |
|---|---|
| `boot_log(app_name, msg, truncate)` | 写 `%TEMP%\<app_name>-boot.log`。不依赖 `AppHandle`，可以在 `Builder` 之前调。`truncate = true` 用于启动时清空 |
| `spawn_ready_probe(app_handle, webview_label, delay_ms)` | 延迟后探测页面是否加载，结果写 `frontend.log` 与 boot log |
| `append_frontend_log(app, text)` | 追加一行到前端日志 |
| `frontend_log_path_of(app)` | 取前端日志路径 |
| `HAS_NATIVE_BACKDROP` | 编译期常量，本平台是否支持原生模糊 |
| `DEFAULT_TINT` | 默认着色 `(245, 250, 248, 96)` |

探活依赖 `ui.js` 暴露的 `window.__uiKitReport`，改这个名字要两边一起改。

### 前端日志位置

`<app_config_dir>/frontend.log`。Windows 下通常是
`%APPDATA%\<identifier>\frontend.log`，`identifier` 来自 `tauri.conf.json`。

## 五、可复制片段

### 一个标准的业务面板

```js
import { el, log, snack, timer, on } from '@rolling/ui-kit/ui';
import { invoke, listen } from '@rolling/ui-kit/tauri';

export function mount(root) {
    const status = el('span', { class: 'label', text: '就绪' });
    const fill = el('div', { class: 'progress-fill', style: 'width:0%' });
    const closers = [];

    root.append(
        el('div', { class: 'card' }, [
            el('div', { class: 'card-header', text: '操作' }),
            el('div', { class: 'btn-row' }, [
                el('button', {
                    class: 'btn btn-primary',
                    text: '开始',
                    onClick: run,
                }),
            ]),
        ]),
        el('div', { class: 'card' }, [
            el('div', { class: 'progress-bar' }, [fill]),
            status,
        ]),
    );

    async function run() {
        const t = timer();
        const off = await listen('task-progress', (e) => {
            fill.style.width = e.payload.percent + '%';
        });
        closers.push(off);          // 交给 destroy 统一回收
        try {
            await invoke('run_task');
            snack('完成');
            status.textContent = '完成｜' + t.text();
        } catch (e) {
            snack('失败：' + e, 'err');
            status.textContent = '失败';
        } finally {
            off();
            closers.pop();
        }
    }

    closers.push(on('device-changed', () => log('设备状态变化')));
    log('面板已挂载');

    return {
        destroy() {
            closers.forEach((fn) => fn());
            closers.length = 0;
        },
    };
}
```

`closers` 这个收集器的意义：面板里所有"需要回收的东西"都塞进同一个数组，
`destroy` 里一把清空。比在 `destroy` 里逐个回忆哪里订了什么可靠得多。

### 日志面板

```js
import { el, onLog, logText, clearLog, snack } from '@rolling/ui-kit/ui';

export function mount(root) {
    const box = el('div', {
        class: 'result-scroll',
        id: 'logArea',
        style: 'max-height:none;min-height:420px;font-size:11px',
    });
    box.textContent = logText();

    const off = onLog((line, lines) => {
        box.textContent = line ? lines.join('\n') : '';
        box.scrollTop = box.scrollHeight;
    });

    root.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-header', text: '运行日志' }),
        box,
        el('div', { class: 'btn-row' }, [
            el('button', {
                class: 'btn btn-tonal', text: '复制日志',
                onClick: async () => {
                    await navigator.clipboard?.writeText(logText());
                    snack('已复制');
                },
            }),
            el('button', {
                class: 'btn btn-text', text: '清空',
                onClick: () => { clearLog(); snack('已清空'); },
            }),
        ]),
    ]));

    return { destroy: () => off() };
}
```

`id="logArea"` 这个名字是约定：`ui.js` 的日志面板默认往这个 id 里写。
用 `onLog` 的写法可以自己控制渲染，两者选一个但不要同时用。

### 没有面板生命周期的简单页面

如果这个窗口只有一个固定界面、不需要导航与面板切换，可以不用 `createShell`，
只引样式和工具函数：

```js
import '@rolling/ui-kit/index.css';
import { initBackdrop } from '@rolling/ui-kit/theme';
import { el, snack } from '@rolling/ui-kit/ui';

await initBackdrop();
document.getElementById('content').appendChild(
    el('div', { class: 'card' }, [el('div', { class: 'card-header', text: '标题' })]),
);
```

代价是窗口按钮、异常上报、探活都要自己接。
