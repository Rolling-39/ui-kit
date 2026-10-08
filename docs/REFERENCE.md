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

### 亮暗两套值怎么组织（改配色前先读）

亮暗取值不同的量都以「名称加 -light / -dark 后缀」成对给出，再映射成"当前档位"的普通变量名
（如 `--surface-light` / `--surface-dark` → `--surface`）。
两条路径共用同一份值，所以改配色只需要改一处：

| 路径 | 由谁决定 | 取哪一套 |
|---|---|---|
| 跟随系统 | `:root` 默认 + `@media (prefers-color-scheme: dark)` | 系统偏好 |
| 手动锁定 | `html[data-theme="light"]` / `html[data-theme="dark"]` | 显式指定 |

**手动锁定必须覆盖全部成对变量**，只覆盖一部分会得到杂交态：例如"系统暗 + 手动锁亮"
下表面仍是暗的、背景已经是亮的。`color-scheme` 也必须一起声明 —— 它不随 CSS 变量联动，
而它才是浏览器决定原生绘制控件（下拉展开面板内层、表单控件装饰、非自定义滚动条、
自动填充底色）用亮还是暗的那一档，少了它就会出现"表面换了配色、控件装饰没换"的半杂交态。
`scripts/check-docs.py` 会校验这两件事，漏了直接报错。

成对变量共 14 对：

| 类别 | 浅色 | 深色 |
|---|---|---|
| 品牌 | `--primary-rgb-light` | `--primary-rgb-dark` |
| 表面 | `--surface-light` | `--surface-dark` |
| 玻璃表面 | `--surface-glass-light` | `--surface-glass-dark` |
| 强调玻璃表面 | `--surface-glass-strong-light` | `--surface-glass-strong-dark` |
| 弱表面 | `--surface-variant-light` | `--surface-variant-dark` |
| 正文 | `--on-surface-light` | `--on-surface-dark` |
| 次要文字 | `--on-surface-variant-light` | `--on-surface-variant-dark` |
| 描边 | `--outline-light` | `--outline-dark` |
| 下拉底色 | `--select-bg-light` | `--select-bg-dark` |
| 下拉文字 | `--select-fg-light` | `--select-fg-dark` |
| 原生背景着色 | `--backdrop-tint-light` | `--backdrop-tint-dark` |
| 兜底底色 | `--backdrop-fallback-light` | `--backdrop-fallback-dark` |
| 阴影 | `--shadow-light` | `--shadow-dark` |
| 大阴影 | `--shadow-lg-light` | `--shadow-lg-dark` |

亮暗一致的量不成对：语义色、`--on-primary`、尺寸、字体，以及刻意固定为深色的
`--code-bg` / `--code-fg`（理由见变量旁的注释：highlight.js 只加载了深色一套 token 配色，
只切背景会在浅色底上出现低对比度颜色）。

消费方**不需要**把这份调色板抄进自己项目：直接引 `--surface-glass` 这类"当前档位"变量即可，
锁定用的 `html[data-theme]` 块由套件提供。

### 颜色

用 `R, G, B` 三元组定义，再由 `rgb()` 派生 —— 这样需要透明度的场合可以直接
`rgba(var(--primary-rgb), 0.15)`，不需要到处抄一遍色值。

| 变量 | 浅色 | 深色 | 说明 |
|---|---|---|---|
| `--primary-rgb` | `57, 197, 187` | `74, 218, 208` | 品牌色"当前档位"，派生自 `--primary-rgb-light` / `--primary-rgb-dark`。**要改就改成对的那两个** |
| `--primary` | `rgb(var(--primary-rgb))` | 同左 | 派生，别直接改 |
| `--primary-container` | `rgba(var(--primary-rgb), 0.15)` | 同左 | 悬停底色 |
| `--on-primary` | `#003734` | 同左 | 品牌色上的文字 |
| `--success-rgb` | `23, 125, 93` | `27, 150, 111` | 语义色"当前档位"，派生自 `--success-rgb-light` / `--success-rgb-dark`。**要改就改成对的那两个** |
| `--danger-rgb` | `215, 36, 35` | `227, 83, 82` | 同上 |
| `--warn-rgb` | `156, 98, 19` | `185, 117, 23` | 同上 |
| `--info-rgb` | `33, 112, 192` | `49, 135, 220` | 同上 |
| `--on-semantic` | `#FFFFFF` | `#14181A` | **语义色块之上的文字色**。浅色档色块深→白字，深色档色块亮→深字；写死 `#fff` 会让深色档掉到 3.4~3.9:1 |
| `--success` / `--danger` / `--warn` / `--info` | 由上面派生 | 同左 | |

语义色这一组是**用 WCAG 公式反解出来的**，不是调出来的：四个色 × 四个场景（白字压色块、
彩字压浅底、彩字压深底、深字压色块）全部 ≥ 4.5:1，最低 4.51、最高 5.09。
浅色档既要当色块底（配白字）又要当彩色文字（压浅底），两个需求都指向"更深"；
深色档当彩色文字要够亮，而色块上的文字改用 `--on-semantic`，所以色块也要够亮。
**改之前先算一遍，别凭眼睛调** —— 改前的值在这四个场景里全部不达标（3.03 ~ 3.93）。

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
| `--select-bg` / `--select-fg` | `#FAFDFB` / `#191C1C` | `#191C1C` / `#E0E3E1` |

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
| `--shadow` / `--shadow-lg` / `--shadow-primary` | 前两个成对（`--shadow-light` / `--shadow-dark`）；`--shadow-primary` 从 `--primary-rgb` 派生，不成对 |
| `--code-bg` / `--code-fg` | 代码块配色，**刻意亮暗一致**（说明见变量旁注释） |

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
| `.panel-pending` | 新面板的"待定"状态：`absolute` + `visibility: hidden`。切换时先这样挂上，等它把首屏渲染完再揭示 —— 旧面板在那之前一直留在屏幕上 |
| `.panel-in` | 揭示那一刻才加到面板上，带 0.3s 的入场位移动画（`panelIn`，只动 `transform`，`prefers-reduced-motion` 下关闭） |
| `.backdrop-fallback` | 兜底底色层，`<body>` 的第一个子元素。原生模糊生效后被 `html.backdrop-ok` 撤掉 |
| `html.backdrop-ok` | 由 `theme.js` 在确认原生模糊生效后添加；加了这个类才撤掉兜底底、玻璃才透出桌面 |
| `html.backdrop-forced` | 由 `theme.js` 在"原生背景的明暗控制不了、而应用又锁定了亮/暗"时添加（条件：`applied && 已锁定 && !dark_honored`）。此时 `.backdrop-fallback` 以 0.94 不透明度重新显示，用当前档位的底色盖住颜色不对的原生背景。**Windows 11 上锁定亮色最容易见到它** |

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
| `.select` | 光标手型，字体用 `--font`；展开面板是系统绘制的，靠 `--select-bg` / `--select-fg` 这对令牌定色（随亮暗各给一份），不是写死深色 |
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
  <!-- 可点的 chip 用 <button> 承载：span 无法聚焦，键盘用户选不到它 -->
  <button class="chip on">已选</button>
  <button class="chip">未选</button>
  <!-- 纯展示的键位标记仍用 span -->
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
| `.ok-text` / `.err-text` / `.warn-text` / `.info-text` | 语义文字色 |
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

**`html:` 这个键会绕过 `text:` 的自动转义**，只应传你自己写的静态标记（例如内联一段固定的 SVG）。
外部来源的字符串一律走 `text:` —— 传进 `html:` 就等于把注入面又打开了。这个键存在的意义只是
"确实需要一段固定标记时不必去拼字符串"，不是"HTML 的逃生通道"。

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
| `parseUtc` | `parseUtc(str) → Date \| null` | 把后端存的 UTC 时间串解析成 Date，无时区的串按 UTC 处理 |
| `fmtIsoLocal` | `fmtIsoLocal(iso, opts?) → string` | 转成本地时间；`opts`: `fallback`（默认 `'—'`）、`seconds`、`dateOnly` |
| `fmtRelativeDay` | `fmtRelativeDay(iso, fallback?) → string` | `今天` / `昨天` / `3 天前` / 超过 30 天给日期 |

```js
const t = timer();
await doWork();
status.textContent = t.text();
```

**时间显示一律走 `fmtIsoLocal`，不要 `slice()` 字符串。** 桌面端落库的时间几乎都是 UTC
（前端 `toISOString()`、SQLite 的 `datetime('now')` 都是 UTC），直接切出来显示会差一个时区
偏移 —— 东八区差 8 小时。另外 SQLite 那种 `YYYY-MM-DD HH:MM:SS`（空格分隔、无时区）的串，
JS 的 `new Date()` 会按**本地时间**解析，是个很隐蔽的坑，`parseUtc` 已经处理了。

```js
fmtIsoLocal('2026-10-05T12:00:00.000Z');            // 东八区 → '2026-10-05 20:00'
fmtIsoLocal('2026-10-05 12:00:00');                 // SQLite 格式，同样是 '2026-10-05 20:00'
fmtIsoLocal(null, { fallback: '从未' });             // '从未'
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
| `applyBackdrop(tint, backend?, dark?)` | `{ applied: false, backend: 'browser', ... }` |
| `clearBackdrop()` | `false` |

`invokeOr` 适合"取一个可选信息，失败就用默认值"的场合，省一次 try/catch。

### `@rolling/ui-kit/theme`

```js
import { initBackdrop, isBackdropActive, refreshBackdrop, setTheme, watchColorScheme, readBackdropTint, readBackdropDarkness, isThemeLocked } from '@rolling/ui-kit/theme';
```

| 导出 | 说明 |
|---|---|
| `readBackdropTint()` | 读 `--backdrop-tint`，返回 `[r,g,b,a]` 或 `null` |
| `readBackdropDarkness()` | 读 `color-scheme` 推断原生背景该用的明暗，**永远返回 `true`/`false`**：锁定档直接取，跟随系统档用 `matchMedia` 解析成系统当前值。这个值每次都会传给原生层 |
| `isThemeLocked()` | 当前是手工锁定档（`true`）还是跟随系统（`false`）。只用于判断要不要补自定义底色 |
| `initBackdrop({ backend?, force? })` | 应用原生背景并据结果加/去 `html.backdrop-ok`；`force: false` 强制兜底 |
| `isBackdropActive()` | 原生模糊当前是否生效 |
| `isBackdropForced()` | 是否处于"原生背景明暗控制不了、已补自定义底色"的状态（`html.backdrop-forced`） |
| `watchColorScheme(fn?)` | 监听系统亮/暗色切换并重新取 tint 应用；返回停止函数 |
| `setTheme(mode, { backend? })` | **推荐入口**：设 `light` / `dark` / `system` 档并自动同步原生窗口背景，一步到位。`system` 档等于删掉 `data-theme`；`mode` 传别的值会当场抛错 |
| `refreshBackdrop(backend?)` | 手动重设（换主色后、或切换"跟随系统 / 亮 / 暗"后都要调） |

**`readBackdropDarkness()` 为什么不返回 `null` 表示"跟随系统"**：原生层的那个参数最终落到
`window-vibrancy` 的 `apply_mica(hwnd, dark)`，而它是 `if let Some(dark) = dark { ... }` ——
传 `None` 不是"跟随系统"，而是"这一帧什么都不做"，DWM 属性会停在最后一次被设过的值上。
于是"锁浅色 → 切回跟随系统"会留下浅色窗口底配已经变深的 CSS。所以"跟随系统"在
前端就解析掉，原生层只收具体值；Rust 侧的命令参数也因此是必填的 `bool`。

`createShell` 已经调了 `initBackdrop` 和 `watchColorScheme`。只有你要自己控制时机时才直接用这两个。

**自己管主题的话，用 `setTheme('light' | 'dark' | 'system')`** —— 它把「设 `data-theme` + 调 `refreshBackdrop()`」合成一次调用。手写这两步很容易漏掉第二步：原生背景的明暗是那一步才告诉原生层的。漏掉就会得到"CSS 已经切到浅色、窗口背后还是系统那套深色"，浅色文字变深、深色文字糊在深色底上。`check-docs.py` 校验 `color-scheme` 与锁定块覆盖，就是为这件事兜底。

### `@rolling/ui-kit/shell`

```js
import { createShell } from '@rolling/ui-kit/shell';
```

`createShell(options) → Promise<shell>`。选项与返回值见 [USAGE.md 第 3 节](USAGE.md#3-面板契约)。

它依次做这些事：校验骨架（缺东西会抛错并指向模板）→ 装异常上报 → 绑定标题栏 →
按面板清单生成导航 → 应用原生背景 → 打启动日志 → 打开默认面板（或 hash 指定的）→ 调 `onReady` →
空闲时预热其余面板模块（`prefetchPanels`，可关）。

`showPanel` 的切换分六步，顺序都是刻意的，改之前先读完这一段：

1. **先 `await p.load()` 取到面板模块，再动 DOM。** 反过来写（先清空、再等模块）会让
   "清空 → 等模块 → 建面板"之间内容区是空的，实测冷切换会露出 1 帧空白。
2. 清掉上一轮可能遗留的待定面板（切太快时会有）。
3. **旧面板先留着**：新面板没准备好之前就撤掉它，中间那段"骨架已挂、数据没到"会被看见
   （屏幕上只剩几个表头，卡片和列表都还是空的）。
4. 导航与标题立刻更新 —— 点下去就该有反馈，这部分与数据无关。
5. 新面板以 `.panel-pending` 挂上并开始 mount，然后 `await Promise.race([mounted, 150ms])`
   —— 等它把首屏渲染完；最多等 `REVEAL_MAX_MS`（150ms），慢面板到点就先把骨架显示出来，
   不让用户对着上一个界面发呆。
6. **原子替换**：撤旧 + 去 `.panel-pending` + 加 `.panel-in`（动画）+ 复位滚动，落在同一帧。

启动时的第一个面板没有旧面板可留，直接显示、不隐藏，避免应用窗口先空一段。

这依赖一条**面板契约**：`mount()` 返回的 promise 落地时，首屏数据应当已经渲染完
（见 [USAGE.md 第 3 节](USAGE.md#3-面板契约)）。面板提前 resolve 的话，第 5 步就会提前揭示，
空骨架又会被看见。

## 四、Rust

crate 名 `tauri-ui-kit`。命令在 `tauri_ui_kit::commands`，辅助函数在 `tauri_ui_kit` 根。

### 命令

| 命令 | 参数 | 返回 |
|---|---|---|
| `ui_kit_apply_backdrop` | `tint: Option<(u8,u8,u8,u8)>`, `backend: Option<String>`, `dark: bool` | `BackdropReport` |
| `ui_kit_clear_backdrop` | — | `Result<(), String>` |
| `minimize_window` | — | `Result<(), String>` |
| `toggle_maximize_window` | — | `Result<(), String>` |
| `close_app_window` | — | `Result<(), String>` |
| `js_log` | `text: String` | `Result<(), String>` |
| `frontend_log_path` | — | `Result<String, String>` |

`dark` 是期望的原生背景明暗：`true` 深 / `false` 浅。**它是必填的，没有"不传"这一档**。
"跟随系统"由前端解析成具体值后再传（见上一节的 `readBackdropDarkness`）——
因为底层 `apply_mica` 收到 `None` 时会跳过设置那一步，让属性停在上一次的值上。

`BackdropReport`：

```rust
pub struct BackdropReport {
    pub applied: bool,        // 原生模糊是否真的生效
    pub backend: String,      // "acrylic" / "mica" / "vibrancy" / "none"
    pub os_build: Option<u32>,// Windows 构建号，排查用
    pub detail: String,       // 失败原因或注意事项
    pub dark_honored: bool,   // 明暗是否会按传入的 dark 走
}
```

`dark_honored = false` 表示这条后端控制不了明暗，此时前端要自己补一层该档位的底色
（`theme.js` 会加 `html.backdrop-forced`）。各后端的情况：

| 后端 | 明暗可控吗 | 说明 |
|---|---|---|
| `mica`（Win11） | 可控 | 第二个参数就是 DWM 的 immersive dark mode |
| `acrylic`（Win10） | 可控 | 明暗由 tint 决定 |
| `acrylic`（Win11） | **不可控** | DWM 分支既忽略 tint、也没有明暗开关 |
| `vibrancy`（macOS） | **不可控** | 跟随系统外观 |

`backend` 取值：`"acrylic"`（默认）/ `"mica"`（仅 Win11）/ `"auto"`（Win11 用 mica，其余 acrylic）。

`applied: false` 时**前端必须保持不透明兜底底色**，`theme.js` 已经这么做了。自己接的话别漏。

### 辅助函数

| 函数 | 说明 |
|---|---|
| `boot_log(app_name, msg, truncate)` | 写 `%TEMP%\<app_name>-boot.log`。不依赖 `AppHandle`，可以在 `Builder` 之前调。`truncate = true` 用于启动时清空 |
| `spawn_ready_probe(app_handle, app_name, webview_label, delay_ms)` | 延迟后探测页面是否加载，结果写 `frontend.log` 与 boot log。`app_name` 要与 `boot_log` 用的名字一致 |
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

`ui.js` **不会**自己去找 `id="logArea"` 往里写：日志面板怎么渲染完全由你这边控制
（上面这段用 `onLog()` 订阅）。`id="logArea"` 只是 demo 里沿用的名字，可以省掉。

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
