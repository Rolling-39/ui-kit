# 迁移手册

把已有的三个项目（Base64 Tool Desktop、S2PNG Tool Desktop、Keypad Tool）从"各自一份拷贝"
迁到共用的 `@rolling/ui-kit`。

**先读最后一节「视觉差异」，再决定要不要迁。** 本套件以 Keypad 那份为基线，
所以 Keypad 迁过去几乎无变化，另外两个会有可见的外观改动。

## 目录

- [一、要不要迁](#一要不要迁)
- [二、通用步骤](#二通用步骤)
- [三、逐项目注意点](#三逐项目注意点)
- [四、视觉差异清单](#四视觉差异清单)
- [五、风险与回滚](#五风险与回滚)
- [六、迁完的验收清单](#六迁完的验收清单)

---

## 一、要不要迁

| 项目 | 现状 | 迁移收益 | 建议 |
|---|---|---|---|
| Keypad Tool | 17.7 KB styles.css，面板已拆成 `src/panels/*.js`，已有 `isTauri` 降级、事件总线、`destroy/refresh` 生命周期 | 样式与骨架收归公共，以后改 UI 一次生效 | 迁。它本身就是基线，风险最低，**先拿它试水** |
| S2PNG Tool Desktop | 212 行重写版样式，与另两个都不同 | 省掉一份私有样式；拿回它自己修好但没回流的边框可见度改动 | 迁，但要先实机比对不透明度取值（见第四节） |
| Base64 Tool Desktop | 478 行样式；UI 是 `buildUI()` 里一整段 innerHTML 字符串；`main.js` 581 行 | 收益最大：拆掉 122 行 HTML 字符串，面板化，顺手修掉取消位残留与临时文件泄漏 | 迁，但工作量最大，放最后 |

不建议一次迁三个。先迁 Keypad 跑通一轮，把接入步骤和坑固化成检查清单，再迁下一个。

## 二、通用步骤

### 1. 备份

```bash
cd E:/AI_Coding_File
cp -r Keypad-Tool Keypad-Tool.bak
```

迁移会动 `src/`、`src-tauri/src/main.rs`、`Cargo.toml`、`tauri.conf.json`、`capabilities/`。
有个能立刻回退的副本，比事后 `git` 里翻强。

### 2. 装依赖、接 Vite

按 [USAGE.md 步骤 1–2](USAGE.md#1-接入步骤) 做。注意三个项目现在的 `vite.config.js`
都只有 `root` / `build` / `server.port` / `clearScreen`，需要补
`server.fs.allow: ['..']` 和 `resolve.preserveSymlinks: false`。

三个项目都有 `src-tauri/vite.config.js` 那份副本。迁移时先把两份的配置**改成一致**，
别在迁移过程中同时动它，否则构建出问题分不清是哪边引起的。

### 3. 换页面骨架

原 `src/index.html` 与本套件的 `shell.template.html` 差异：

| 项 | 旧 | 新 |
|---|---|---|
| `html` / `body` 背景 | 内联 `style="background:transparent!important"` | 删掉，交给 `shell.css` 与 `theme.js` |
| `<div class="backdrop-fallback">` | 没有 | **必须加**（模板自带）。少它 = 无模糊平台上文字糊在桌面上 |
| `<link rel="stylesheet">` | 指向本地 `styles.css` | 删掉，改在 `main.js` 里 import 套件样式 |
| 导航按钮 | 手写在 HTML 里 | 删掉，`createShell` 生成 |
| 侧栏标题 / 页脚 | 硬编码 | 保留，`createShell` 会用参数覆盖 |

Keypad 的 `index.html` 里那段内联异常上报 `<script>`（写 `js_log`）保留即可，
套件的 `installErrorReporter()` 也做同样的事，两者不冲突。要精简的话可以删掉，
反正 `createShell` 会装。

### 4. 改入口

三个项目现在的入口结构不同：

| 项目 | 旧入口 | 新入口 |
|---|---|---|
| Keypad | `main.js` 里手写 `PANELS` 表 + `bindTitlebar` + `bindNav` + `showPanel` | 全部删掉，换成一次 `createShell({ panels })` |
| S2PNG | 同 Keypad 的形态 | 同上 |
| Base64 | `main.js` 里 `buildUI()` 用 innerHTML 拼出全部面板 | 每个面板拆成 `src/panels/<name>.js`，导出 `mount(root)`；`buildUI` 删除 |

`main.js` 最终大概只剩：

```js
import '@rolling/ui-kit/index.css';
import { createShell } from '@rolling/ui-kit/shell';

await createShell({ appName: '…', panels: {…}, defaultPanel: '…' });
```

### 5. 收拢样式

原 `styles.css` 里已经被套件覆盖的规则删掉，只留业务专属的：

| 项目 | 属于业务、应保留在项目里 | 应删除（套件已提供） |
|---|---|---|
| Keypad | `.keycap` `.stage` `.stage-wrap` `.editor` `.macro-*` `.action-row` `.swatch` `.test-*` `.bind-chip` `.device-card` `.device-line` `.device-id` | 布局、卡片、按钮、输入、进度、结果区、提示条、滚动条、响应式 |
| S2PNG | 业务表单相关 | 同上 |
| Base64 | `.progress-*` `.result-*` `.toggle-*` `.textarea` `.btn-*` 之外的自定义部分 | 同上 |

`polyfill.js` 可以删掉，功能由 `@rolling/ui-kit/tauri` 提供。
它导出的 `invoke` / `open` / `save` 对应到套件的 `invoke` / `openDialog` / `saveDialog`，
`minimize` / `toggleMaximize` / `closeWindow` 对应到同名函数。
`readTextFile` / `writeTextFile` / `writeFile` / `writeText` 套件**没有**提供
—— 需要的话从 `@tauri-apps/plugin-fs` 与 `plugin-clipboard-manager` 直接引，
或者改用自己的 Rust 命令（Base64 现在其实就是走 Rust 命令的，前端那几个调用是死代码）。

### 6. 接原生侧

按 [USAGE.md 步骤 5–7](USAGE.md#1-接入步骤)。三个项目都要做的：

- `Cargo.toml` 加 `tauri-ui-kit` 与**两处** `indexmap`
- `main.rs`：删掉 `setup` 里的 `apply_acrylic` / `apply_vibrancy` 调用，
  改为调 `spawn_ready_probe`；注册 7 个套件命令
- `capabilities/default.json`：删掉 `fs:*` 权限（套件不用；如果业务也不再需要就一起删），
  保留 `core:default` 与 `dialog:*`
- 自己的命令如果写成 `pub fn` 又放在 `main.rs`，要么改私有，要么移进子模块

### 7. 清掉残留

迁完之后顺手确认这几项（都是抽库时发现的问题）：

- `src-tauri/vite.config.js` 是否还需要（见第四节末）
- `base64-tool.exe` / `base64-tool.lnk` 这类构建产物是否还在被 git 跟踪（应删掉并加进 `.gitignore`）
- `Cargo.toml` / `package.json` / `tauri.conf.json` 三处版本号是否还都是 `1.0.0`（Release 已经到 v2.1 了）
- `tauri` 的 `tray-icon` feature 是否真的用到了（Base64 开了但没实现托盘）
- `.spinner` / `.loading-row` / `.progress-*` 这些类在本项目里到底有没有被用到，没用到的别跟着搬

## 三、逐项目注意点

### Keypad Tool（建议第一个）

- 它现在的 `core.js` 导出 `snack` / `log` / `el` / `on` / `emit` / `fmtTime` / `pending*` 等。
  前六个套件都有（`fmtTime` 同名同义）。把 `core.js` 里这部分删掉，改为 re-export 或直接改 import 来源，
  **业务状态与设备操作（`state` / `call` / `refreshDevices` / `connectDevice` / `loadCore` / `ensureKeymap`…）留在 `core.js`**。
- `core.js` 里的 `isMock` 依赖 `polyfill.js` 的 `isTauri`，改成从 `@rolling/ui-kit/tauri` 取。
- `main.js` 里的 `window.__keypadRefresh` 是给面板回调用的，套件用 `shell.refresh()` 替代。
- 面板里若直接 `import` 了 `./polyfill.js` 或 `../core.js` 的 UI 函数，一并改来源。
- `panels/test.js` 会开系统级输入监听线程，它的 `destroy` 已经是关键路径，
  迁到新契约后确认 `destroy` 仍然被 await（`createShell` 会 await）。

### S2PNG Tool Desktop

- 它的 `styles.css` 是重写压缩版，与另两个都不同：`--surface-glass` 0.45/0.78、
  `--outline` 0.45/0.55，另外多了一条全局
  `html, body, .app, .app-body, .content, .panel { background: transparent !important; }`。
  **这条全局规则正是兜底底色失效的原因**，迁移时必须删掉。
- 它当初把不透明度调高，很可能是为了在真实亚克力下让边框和文字看得清。
  迁到套件的基线值（0.30/0.68、outline 0.3/0.35）之后，**实机看一眼**：
  如果边框看不清，正确做法是调 `ui-kit/src/tokens.css` 里的变量（一处改动三个项目受益），
  而不是回到项目里覆盖。
- 它也缺 `color-scheme: dark`（深色模式下原生滚动条/form 控件会偏亮），
  套件已在 `src/shell.css` 里给了 `color-scheme: dark light`，迁完这个问题自动没了。
  （注意是 `shell.css`，不是 `tokens.css`：`tokens.css` 里只有亮暗成对变量与
  `html[data-theme]` 锁定块，`color-scheme` 的"跟随系统"默认值写在骨架样式里。）
- 它的 `polyfill.js` 里剪贴板支持被删过，换成 `@rolling/ui-kit/tauri` 后按需重新引剪贴板插件。

### Base64 Tool Desktop（建议最后）

工作量最大的一个，也是收益最大的。

- `main.js` 里的 `buildUI()`（约 122 行 HTML 字符串）要拆成三个面板：
  加密、解密、批量。对应现有 `initEncode` / `initDecode` / `initBatch` 里的逻辑，
  搬进各自的 `mount(root)`，把 `$('xxx').addEventListener` 换成对新建元素挂事件。
- 顺便修掉两个搬迁中会顺路暴露的行为缺陷（都是这个项目自身的，跟套件无关）：
  1. **取消一次后单文件加密永久失败**。`encode_file_stream` 没有 `reset_cancel()`，
     而 `decode_file_stream` 有。取消位残留为 `true`，下一次编码在第一个分块就被判取消。
     修法：在每个长任务命令入口清标志位，别让调用方去记（[USAGE.md 4.1](USAGE.md#41-长任务进度条与取消) 的写法）。
  2. **取消保存对话框后 `.tmp_decoded` 残留**。提前 `return` 没走清理路径，要挪进 `finally`。
- `detect_file_type_from_path` 现在是 `fs::read` 整个文件再取前 512 字节，
  GB 级解密时违背 README 里"内存 <10MB"的承诺。改成只读前 512 字节。
- `capabilities/default.json` 里的 `fs:allow-*` 权限可以删：前端的 `readTextFile` / `writeFile`
  已经是死代码，实际 IO 全走 Rust 命令。
- 顺带清理：`base64-tool.exe` 与 `base64-tool.lnk` 被 git 跟踪（5.3 MB 二进制 + 一个指向本机路径的快捷方式），
  应删掉并加进 `.gitignore`；三处版本号还停在 `1.0.0`，Release 已经到 v2.1。

## 四、视觉差异清单

**这是迁移前必须确认的。** 套件以 Keypad 为基线，所以下面这些项在 Base64 / S2PNG 上会变。

| 项 | 旧（Base64 / S2PNG） | 新（套件基线） | 影响 |
|---|---|---|---|
| 分段开关内边距 | `10px 0` | `9px 10px` | 长中文标签不再贴边，宽度略变 |
| 导航项内边距 | `12px 14px` | `10px 14px` | 侧栏导航整体略紧凑 |
| 撑满型按钮行 | `.btn-row` 默认拉伸 | `.btn-row` 不拉伸，拉伸需加 `.fill` | **Base64 加密/解密页的按钮需要改 class**，不改会变成左对齐不等宽 |
| 浅色模式玻璃 | 深色 tint（`18,18,18,64`） | 浅色 tint（`245,250,248,96`） | 浅色模式下玻璃不再发灰 |
| 品牌色 | 约 10 处字面量 `rgba(57,197,187,…)` | 全部走 `--primary-rgb` | 外观一致，但换主题只需改一个变量 |
| 表面不透明度 | Base64 0.30/0.68、S2PNG 0.45/0.78 | 0.30/0.68 | **S2PNG 的玻璃会变透**，需实机对比 |
| 描边不透明度 | Base64 0.3/0.35、S2PNG 0.45/0.55 | 0.3/0.35 | **S2PNG 的边框会变淡**，需实机对比 |
| 无模糊平台 | 透明 + 0.15 不透明度，糊字 | 不透明兜底底色 | Linux/老 Windows 上从"不可读"变成"可读" |
| 结果区 `user-select` | Base64 `all` | `text` | 结果区可以只选一部分了 |
| `.result-item.success` 左边线 | Base64 字面量 `#1D9E75` | `var(--success)` | **不再与原来那个绿一模一样**：套件的语义色按亮暗成对给出（浅色档压深、深色档提亮），是为了让"白字压色块"与"彩字压玻璃"都达到 4.5:1。观感会略深一点 |

改动本身都很小，但**不要一次性把样式、行为、原生化三件事混在一次提交里**：
先只换样式与骨架、实机跑一遍确认外观，再动行为修复。

## 五、风险与回滚

| 风险 | 触发条件 | 处理 |
|---|---|---|
| 路径依赖失效 | `ui-kit` 目录被移动/改名，或项目被挪到别处 | `Cargo.toml` 的 `path` 与 `package.json` 的 `file:` 都要改。项目挪位置时批量检查这两处 |
| 样式覆盖顺序 | 项目自己的 CSS 在套件之后加载会覆盖套件；反之则被覆盖 | `main.js` 里 `import '@rolling/ui-kit/index.css'` 必须在项目自己的样式**之前** |
| Vite 解析不到软链 | `server.fs.allow` 没配 | 见 [USAGE.md 步骤 2](USAGE.md#1-接入步骤)，或用别名方案 |
| 面板 `destroy` 漏写 | 面板里有定时器/订阅/监听线程 | 迁每个面板时都过一遍：谁订的、在哪退 |
| 视觉回退 | S2PNG 的边框、透明度变化后不好看 | 先只调 `ui-kit/src/tokens.css` 的变量（一处生效全局）；确实只有它需要不同，再在项目里覆盖 |
| 整体不可用 | 迁出问题 | `Keypad-Tool.bak` 整个目录复制回去即可。没有提交历史也能回退 |

回滚点建议：

```bash
cd Keypad-Tool && git add -A && git commit -m "迁移前快照"
# 再开始改
git checkout .          # 需要放弃时
```

## 六、迁完的验收清单

- [ ] `npm run dev` 能起，界面骨架完整，导航项按面板清单生成
- [ ] 标题栏三个按钮都生效（最小化/最大化/关闭）
- [ ] 窗口标题随面板切换变化
- [ ] `#面板名` 能直达对应面板
- [ ] 日志面板有内容，且能看到 `原生窗口背景已生效：xxx` 或明确说明走兜底
- [ ] **在 DevTools 里把 `html` 的 `backdrop-ok` 去掉**，界面依然可读（验证兜底路径）
- [ ] 每个面板切进切出若干次，日志里没有累积的重复事件（验证 `destroy` 真的在跑）
- [ ] 长任务：进度条在动、耗时在走、取消能立刻停
- [ ] 批量任务：结果逐条追加，成功/失败计数正确
- [ ] 前端异常能落盘：手动在控制台抛一个 `throw new Error('x')`，去 `frontend.log` 里能看到
- [ ] `npm run build` 产出的 exe 实机跑过一遍（不是只跑 `dev`）
- [ ] 项目自己的 CSS 只剩业务规则，没有残留的布局/按钮/卡片规则
- [ ] `polyfill.js` 已删除，没有文件还在 import 它
- [ ] `capabilities` 里不再有实际没用到的权限
