# 优化清单

2026-10-07 全库评审的落地文档。评审范围：`src/`、`rust/`、`demo/`、`docs/`、`scripts/`、CI 与两张效果图。
行号以当日代码为准，修完一项勾一项；行号漂移了就按符号名搜。

本文档在 `docs/` 下，会被 `check-docs.py` 的**链接与重复锚点**检查扫描；类名/变量点名检查只作用于
README / REFERENCE / USAGE，本文不受约束。

---

## 修复进度（2026-10-07，已逐项复跑验证）

以下 11 项已修。验证方式：无头 Edge + CDP 探针跑 7 条断言，修复前全部复现、修复后全部翻转为「未复现」；
另跑 `check-docs.py`（通过）、`check-exports.mjs`（通过）、`cargo check`（通过）。

| 项 | 改动位置 | 要点 |
|---|---|---|
| P0-1 | `src/theme.js` | `useBackdrop:false` 记进模块级 `backdropAllowed`；`watchColorScheme` / `refreshBackdrop` 先判断它 |
| P0-2 | `src/shell.js` | 首面板加 `FIRST_REVEAL_MAX_MS = 1000` 超时兜底（原来 `await mounted` 无上限） |
| P0-3 | `src/shell.js` | 首面板等待期被切走时补 `safeDestroy`，与 willSwap 分支对齐 |
| P0-4 | `demo/panels/contract.js` | 改用 `emit('demo-event', …)`，不再用 `window.dispatchEvent` |
| P0-5 | `docs/USAGE.md`、`demo/panels/contract.js` | 两处「会先 await destroy()」改为「异步回收、不阻塞揭示」 |
| P1-4 | `src/ui.js`、`rust/src/lib.rs` | 落盘行带时间戳（`log()` 返回值复用）；日志超 1 MB 截成尾部 256 KB |
| P1-7 | `docs/REFERENCE.md`、`docs/USAGE.md`、`src/shell.template.html` | 删重复段；错引的节号改成 markdown 链接（让 check-docs 能查）；删无效的 theme-color |
| P1-8 | `src/shell.js` | 必需钩子逐个校验并点名；**tbTitle 降为可选**（见下方风险说明） |
| P1-9 | `src/glass.css` | 补 `:focus-visible` 体系（品牌色 2px 圈），输入类排除以免叠圈 |
| P2-9 | `src/glass.css`、`demo/panels/showcase.js` | `.chip` 支持 `<button>` 承载，demo 改成 button 示范 |
| P2-11 | `src/ui.js`、`src/shell.js` | snackbar 加 `role`/`aria-live`（err 用 alert）；面板错误卡加 `role="alert"` |

### P1-8 的一个兼容性风险（已在实现中规避）

把骨架校验从 1 个钩子扩到 6 个时发现：**`Base64_Tool_Desktop` 与 `S2PNG_Tool_Desktop` 的 `index.html` 都没有 `tbTitle`**。
若把 6 个全列为必需，这两个项目将来接入套件时会因一个纯展示元素而直接起不来。
最终实现区分两类：

- **必需（缺了坏功能）**：`sidebarNav` `content` `tbMin` `tbMax` `tbClose`
- **可选（缺了只降级）**：`tbTitle` —— 只影响标题栏那行文字，`document.title` 另设、不依赖它

四种情形都实测过：齐全→正常启动；缺 `tbTitle`→正常启动；缺 `tbMax`→抛错并点名 `#tbMax`；缺两个→两个都点名。

### 复核本清单时发现的三处需要修正

| 项 | 修正 |
|---|---|
| **P1-2 范围低估** | 不只 danger / warn。四个语义色白字**全部**不达标（AA 要 4.5）：success **3.39**、info 3.59、warn 3.72、danger 3.93；而且 `.badge.*` / `.ok-text` 这类 11–13px 彩色小字压**浅色**玻璃只有 **3.03–3.52**，比按钮更普遍 |
| **P1-8 优先级下调** | `check-docs.py` 的 `check_shell_hooks()` 已在 CI 里校验钩子与模板一致，模板改坏时 CI 先红。真实价值只剩"运行时错误信息更友好"，属 P2 级 |
| **P0-5 漏一处** | 同款错误说法在 `demo/panels/contract.js` 也有一份，原文只点了 `USAGE.md`（已一并修） |

### 未做的（需要另行决定）

| 项 | 为什么没做 |
|---|---|
| P1-2 | 改配色属于视觉变更，会动四个语义色的取值与 `tokens.css` 结构，需先确认观感 |
| P1-1、P1-6 | 视觉变更 / 需在真实 WebView2 上先确认渲染（无头浏览器的滚动条实现与 WebView2 不同，测了不准） |
| P1-3、P1-5 | 属于**新增公开 API**（`setTheme` / `clearBackdrop`），同意后需同步改 `check-docs.py` 的 `js_names` 清单 |
| P1-10、P2-4、P2-5 | 护栏三件套，1~2 天，建议单独排期 |
| P2-2、P2-3 | 需要真实机器的缩放档位 / 需要重新截图 |
| P2 其余、P3 | 攒批 |

> **新增导出时注意**：`scripts/check-docs.py` 里 `check_claims()` 的 `js_names` 是**硬编码清单**，
> 新导出不加进去就没有护栏，而且 CI 不会变红（静默失效）。`check_theme_lock` 则是从 `tokens.css`
> 算出来的，新增 `--x-light`/`--x-dark` 成对变量会自动被纳入。
>
> **顺带踩到的一个坑**：在 `shell.js` 的注释里举例写了一次「`$` 加圆括号」的字面量，被
> `check_shell_hooks()` 的正则抓成假钩子 `#id`，CI 直接报错。注释里也别写这种字面量。

## 分级标准

| 等级 | 定义 | 处理节奏 |
|---|---|---|
| **P0** | 正确性缺陷：行为与设计意图不符、会真实翻车或误导接入方，且修法明确 | 立即修，合计约一个下午 |
| **P1** | 高价值：观感大单点、防回归护栏、会误导人的文档/API 硬伤 | 下一轮开发窗口 |
| **P2** | 体验与一致性：值得做、不紧急 | 排期，攒批做 |
| **P3** | 低优先：锦上添花 | 空闲时 |

统计：P0 × 5｜P1 × 10｜P2 × 11｜P3 × 8，共 34 项。

---

## 总览

| 编号 | 事项 | 类型 | 位置 | 预估 |
|---|---|---|---|---|
| P0-1 | `useBackdrop: false` 被系统切主题静默推翻 | 缺陷 | `src/theme.js` | 10 分钟 |
| P0-2 | 启动首面板 mount 无超时，挂死则永远空屏 | 缺陷 | `src/shell.js` | 15 分钟 |
| P0-3 | 首面板等待期间 handle 泄漏 | 缺陷 | `src/shell.js` | 10 分钟 |
| P0-4 | demo「触发 demo-event」按钮没走事件总线 | 缺陷（demo） | `demo/panels/contract.js` | 2 分钟 |
| P0-5 | USAGE 声称 showPanel「先 await destroy」与实现相反 | 文档硬伤 | `docs/USAGE.md` | 5 分钟 |
| P1-1 | 标题栏按钮文本字形换 SVG + 最大化还原图标 | 视觉 | `src/shell.template.html` | 1 小时 |
| P1-2 | 语义色白字对比度不达标（WCAG AA），语义色做成对变量 | 视觉/可访问性 | `src/tokens.css` | 半天 |
| P1-3 | 补 `setTheme()` 帮手函数 | API | `src/theme.js` | 30 分钟 |
| P1-4 | frontend.log 无时间戳、无轮转 | 排障能力 | `src/ui.js` + `rust/src/lib.rs` | 45 分钟 |
| P1-5 | `ui_kit_clear_backdrop` 对 mica 窗口无效且无 JS 封装 | 缺陷 | `rust/src/commands.rs` | 15 分钟 |
| P1-6 | 滚动条 thumb 的 `opacity: 0.3` 大概率无效 | 视觉缺陷 | `src/shell.css` | 10 分钟 |
| P1-7 | 文档硬伤包：重复段 / 错引节号 / 无效 meta | 文档 | 三处 | 15 分钟 |
| P1-8 | 骨架校验只查 tbMax 一个钩子 | 健壮性 | `src/shell.js` | 5 分钟 |
| P1-9 | 无 `:focus-visible` 体系 | 可访问性/视觉 | `src/glass.css` 等 | 20 分钟 |
| P1-10 | 把手工验证固化进 CI（逐帧采样 + 主题锁定） | 防回归 | CI | 半天~1 天 |
| P2-1 | `preview-blur.png` 说明与画面不符 | 文档/视觉 | `demo/` + README | 10 分钟 |
| P2-2 | 0.5px 边框高 DPI 实测（风险：淡到不可见） | 视觉健壮性 | `src/glass.css` | 1 小时 |
| P2-3 | 补浅色模式截图 + 浅色兜底下卡片边界目检 | 视觉/文档 | `demo/` | 30 分钟 |
| P2-4 | 纯函数单测（fmtSize / parseUtc 等） | 测试 | `src/ui.js` | 1 小时 |
| P2-5 | showPanel 状态机拆分可测 | 可维护性 | `src/shell.js` | 半天 |
| P2-6 | 视觉小项打包：按压态 / transition:all / reduced-motion / 空状态 | 视觉 | `src/glass.css` | 1 小时 |
| P2-7 | `icon(name)` 图标 helper | API | `src/ui.js` | 1~2 小时 |
| P2-8 | REVEAL_MAX_MS / LOG_MAX 等魔法数配置化 | API | `src/shell.js` `src/ui.js` | 20 分钟 |
| P2-9 | `.chip` 键盘不可达 | 可访问性 | `src/glass.css` | 20 分钟 |
| P2-10 | 超宽屏内容舒适上限 ~1200px | 视觉 | `src/shell.css` | 10 分钟 |
| P2-11 | snackbar / 错误卡片补 aria-live | 可访问性 | `src/ui.js` `src/shell.js` | 10 分钟 |
| P3-1 | 侧栏窄窗口收成图标栏 | 功能 | `src/shell.css` | 半天 |
| P3-2 | 关闭拦截路径的验证与文档 | 功能 | `rust/src/commands.rs` | 30 分钟 |
| P3-3 | 补 CHANGELOG.md | 工程化 | 仓库根 | 30 分钟 |
| P3-4 | `.dot.off` 红色表「离线」语义偏移 | 视觉 | `src/glass.css` | 5 分钟 |
| P3-5 | `--code-bg/-fg` 补 `.code-block` 组件或标注 | 一致性 | `src/glass.css` | 20 分钟 |
| P3-6 | js_log 缓冲合并写 | 性能 | `rust/src/lib.rs` | 30 分钟 |
| P3-7 | fmtSize 缺 TB 档；fmtTime 与 fmtIsoLocal 空值符号不一 | 小一致性 | `src/ui.js` | 10 分钟 |
| P3-8 | demo 导航换 SVG 图标展示 | 视觉 | `demo/main.js` | 20 分钟 |

---

## P0 —— 正确性缺陷（立即修）

### P0-1 `useBackdrop: false` 被系统切主题静默推翻

- **现象**：`initBackdrop` 的 `force` 参数只存在局部变量里（`src/theme.js:135-136`）；`watchColorScheme` 的 handler（`src/theme.js:179-196`）在系统亮暗切换时无条件 `applyBackdrop` + `reflectBackdrop`。
- **影响**：Tauri 端配置了强制不透明兜底的应用，用户切一次系统主题就被变回玻璃——「给反馈透明窗口不好用留的开关」失效，且无任何日志。
- **改法**：`theme.js` 加模块级 `let forced = true;`，`initBackdrop` 时赋值，`watchColorScheme` 的 handler 与 `refreshBackdrop` 里先判断 `forced`，为 `false` 时直接维持兜底并跳过原生调用。
- **验收**：`useBackdrop: false` 启动后切系统主题，DevTools 里 `html` 不出现 `backdrop-ok`。

### P0-2 启动首面板 mount 无超时，挂死则永远空屏

- **现象**：切换路径有 `REVEAL_MAX_MS = 150` 兜底（`src/shell.js:173-174`），但第一个面板走 `await mounted`（`src/shell.js:192`）无限等。
- **影响**：任一面板的 `mount` 挂在永不 resolve 的 promise 上（如业务 invoke 卡死），应用启动后内容区永远空白，只能靠 frontend.log 定位。
- **改法**：else 分支同样 `Promise.race([mounted, timeout])`，超时可比 150ms 宽（建议 1s，另开常量）；超时后照常揭示，mount 完成后补 `currentPanel`（与 willSwap 分支第 199-200 行同款）。
- **验收**：造一个 `mount` 里 `await new Promise(() => {})` 的面板，启动 1 秒后界面已揭示（骨架/加载态可见），不再永远空屏。

### P0-3 首面板等待期间 handle 泄漏

- **现象**：`src/shell.js:193-195` 在 `await mounted` 后 token 变了直接 `return`，没有像 willSwap 分支（`src/shell.js:177-179`）那样注册 `safeDestroy`。
- **影响**：启动阶段若用户在首面板 mount 完成前点了别的导航项（导航监听在初始 showPanel 之前就绑好了），首个面板里起的定时器/订阅/监听线程永远不会被回收。窗口极窄但后果是典型「切一次多一个」型泄漏。
- **改法**：early return 前补一行 `mounted.then(() => { if (token !== switchToken) safeDestroy(handle); });`，与 willSwap 分支对齐。
- **验收**：首面板 mount 里挂 `setInterval` + `log()`，启动后立即点第二个面板，3 秒后日志不再增长。

### P0-4 demo「触发 demo-event」按钮没走事件总线

- **现象**：`demo/panels/contract.js:38` 执行的是 `window.dispatchEvent(new Event('x'))`，DOM 事件进不了 `ui.js` 的事件总线；`emit` 导入了但从未调用。
- **影响**：这个面板的核心卖点就是演示总线，按钮按了只有「已触发」提示、日志里永远看不到「收到 demo-event」——功能展示是坏的。
- **改法**：改成 `emit('demo-event', '…')`。
- **验收**：点按钮，日志面板出现「收到 demo-event：…」。

### P0-5 USAGE 声称 showPanel「先 await destroy」与实现相反

- **现象**：`docs/USAGE.md:402` 写「切换面板，会先 `await` 上一个面板的 `destroy()`」；但 `safeDestroy` 注释明说「刻意不 await：揭示画面不该被别的东西拖住」（`src/shell.js:98-106`）。
- **影响**：接入方若信文档，会写出依赖「旧面板清理完成后再挂新面板」的逻辑（如设备独占访问），实际时序不保证——这类 bug 在消费项目里极难查。这也是 `check-docs.py` 查不到的语义漂移。
- **改法**：改文档（实现的选择是对的）：「切换面板；上一个面板的 `destroy()` 在揭示后异步回收，不阻塞显示。需要严格先于新面板执行的清理，放在新面板 `mount` 开头或用事件总线衔接」。
- **验收**：`check-docs.py` 通过，且表述与 `shell.js` 注释一致。

---

## P1 —— 高价值（下一轮开发窗口）

### P1-1 标题栏按钮文本字形换 SVG + 最大化还原图标

- **现象**：`-` `+` `x` 是文本字符（`src/shell.template.html:27-29`），小写 x、基线不齐、粗细随字体漂移；最大化后按钮仍是 `+`，缺 Windows 惯例的「还原图标」。
- **改法**：内联 12px 线条 SVG（`stroke: currentColor`，单色随主题）；`createShell` 里给 `tbMax` 的点击回调加图标切换（可通过自定义命令查询/监听最大化状态，或 resize 时近似判断）。
- **验收**：100% / 125% / 150% 三档缩放下图标清晰锐利；最大化后显示还原图标。

### P1-2 语义色白字对比度不达标，语义色做成对变量

- **现象**（实测对比度）：`.btn-danger` / `.snackbar.err` 白字 on `#E24B4A` ≈ 3.9:1；`.snackbar.warn` 白字 on `#BA7517` ≈ 3.7:1；浅色模式下 `.warn-text` / `.badge.warn` 的橙字压浅玻璃 ≈ 3.7:1。正文级字号要求 4.5:1，全部不达标。
- **根因**：语义色亮暗共用一套（`src/tokens.css:31-34`）。
- **改法**：至少给 `warn`（建议四个语义色全做）改成 `-light/-dark` 成对变量：深色档提亮、浅色档压暗；`snackbar.warn` 可改深色文字。成对变量加进 `:root` 与 `@media` 后，`check_theme_lock` 会自动把它们纳入「亮暗有别」集合，锁定块漏覆盖会被机器抓住——检查机制不用改。
- **验收**：白字 on danger ≥ 4.5:1（深色档）；warn 提示条在两个档位都可读；`check-docs.py` 通过。

### P1-3 补 `setTheme(mode)` 帮手函数

- **现象**：主题锁定是头部功能，但套件只给了 CSS 侧（`html[data-theme]` 块），JS 侧「设 `data-theme` → 调 `refreshBackdrop()`」每个消费方都要自己写，而 README/REFERENCE 反复警告漏调 `refreshBackdrop` 的后果。
- **改法**：`theme.js` 加 `setTheme('light' | 'dark' | 'system')`：设/删 `data-theme` 后 `await refreshBackdrop()`；`system` 档删除属性即可。写进 REFERENCE 的 theme 节。
- **验收**：三档切换后 `color-scheme` 与表面取值正确，无杂交态（可复用 README 里的 18 组合手测方法抽测）。

### P1-4 frontend.log 无时间戳、无轮转

- **现象**：`logPersist` 把原始 msg 发给 `jsLog`（`src/ui.js:27-30`），时间戳只在内存版 `log()` 里拼，落盘行全部没有时间；`append_frontend_log`（`rust/src/lib.rs:102-110`）纯 append 无上限。
- **影响**：事后排障时「什么时候错的」往往比「错在哪」更关键；发出去的桌面应用日志会无限增长。
- **改法**：时间戳加在前端 `logPersist` 里（`jsLog(\`[${new Date().toLocaleTimeString()}] ${msg}\`)`）最简单，`installErrorReporter` 的错误行自动带上；轮转在 Rust 侧 `append_frontend_log` 里做：写入前 stat 文件大小，超过阈值（如 1MB）改 truncate 重写。`boot_log` 行也建议带时间（Rust 侧可接受 epoch 秒或引 chrono——tauri 的传递依赖里已有）。
- **验收**：frontend.log 每行带时间；造 2MB 日志后重启应用，文件被截断且保留最近内容。

### P1-5 `ui_kit_clear_backdrop` 对 mica 窗口无效且无 JS 封装

- **现象**：`rust/src/commands.rs:135-152` 只调 `clear_acrylic`；window-vibrancy 0.6 有 `clear_mica`。且 `tauri.js` 没有这个命令的封装——目前是「注册了但前端够不着」的半成品。
- **改法**：Windows 分支按当前生效的后端选 `clear_mica` / `clear_acrylic`（可在 Rust 侧记住上次 apply 的后端，或由前端把 `backend` 传进来）；`tauri.js` 补 `clearBackdrop()`；REFERENCE 命令表补一行。
- **验收**：`apply_mica` 后调用，窗口回到不透明。

### P1-6 滚动条 thumb 的 `opacity: 0.3` 大概率无效

- **现象**：`src/shell.css:270-274` 对 `::-webkit-scrollbar-thumb` 用 `opacity` 控制透明度——该伪元素不是真实盒子，多数 Chromium 版本直接忽略 `opacity`，thumb 以 `var(--on-surface-variant)` 实色渲染。
- **影响**：深色模式下是 #BEC9C6 浅灰实心 6px 条，非常扎眼（设计意图是 30% 透明度）。
- **改法**：改用带 alpha 的颜色，例如 `color-mix(in srgb, var(--on-surface-variant) 35%, transparent)`（WebView2 的 Chromium 版本支持）。先在 DevTools 确认当前实际渲染，再替换。
- **验收**：深色模式 thumb 明显变淡，浅色模式同样正常。

### P1-7 文档硬伤包（三处一起清）

1. `docs/REFERENCE.md:486-488`：「自己管主题的话，切完 data-theme 必须调一次 refreshBackdrop()……」整段**连写两遍**，删一段。
2. `docs/USAGE.md:629`：「仍不行就用 4.2 节末尾说的别名方案」——别名方案实际在**步骤 2** 的引言块（`docs/USAGE.md:85-88`），4.2 是「批量双层进度」。改成指向步骤 2，最好做成 markdown 链接让 check-docs 能查。
3. `src/shell.template.html:13`：`<meta name="theme-color" content="transparent">` ——theme-color 不认 transparent（当无效值忽略），对 Tauri 也没有意义，删。

- **验收**：`check-docs.py` 通过；`grep` 确认重复段已删。

### P1-8 骨架校验只查一个钩子

- **现象**：`src/shell.js:45` 只校验 `tbMin`，第 58-60 行直接用 `tbMax` / `tbClose`；`tbTitle` 等同样未查。
- **影响**：模板被改坏时用户看到的是 TypeError，而不是指向模板的友好报错——与「宁可当场抛错」的设计意图不符。
- **改法**：六个钩子（`sidebarNav` / `content` / `tbMin` / `tbMax` / `tbClose` / `tbTitle`）遍历校验，缺失时报 `TEMPLATE_HINT` 并点名缺的是哪个。
- **验收**：故意删掉 `tbMax` 再启动，报错信息指名道姓。

### P1-9 无 `:focus-visible` 体系

- **现象**：所有交互件（nav-item / btn / chip / toggle-btn / 输入类）键盘聚焦时是浏览器默认焦点圈，与整体风格脱节；鼠标点击部分场景又会显圈。
- **改法**：统一加 `:focus-visible { outline: 2px solid rgba(var(--primary-rgb), 0.6); outline-offset: 2px; border-radius: 同元素圆角; }`；输入类已有 focus 样式可不动。
- **验收**：Tab 遍历导航与按钮出现品牌色焦点圈；鼠标点击不出现圈。

### P1-10 把手工验证固化进 CI（防回归，本清单里回报最高的一项）

- **现状**：README「状态」一节里的三项硬验证——主题锁定 18 组合（CDP）、面板切换逐帧采样、慢面板负例——全部是一次性手工做的；README 自己写了「延迟类缺陷在浏览器里天然复现不出来」。不固化，回归只能靠人肉。
- **改法**：CI 加一个 job，playwright（或 puppeteer）起 `python -m http.server` 的 demo 后跑三个脚本：
  1. **冒烟**：demo 加载无 console error、导航切换、`#面板名` 直达、日志面板有输出；
  2. **逐帧采样**：复刻 README 手工方法——轮询 `requestAnimationFrame` 断言可见面板数恒为 1、可见卡片数不掉 0；附带负例开关（`REVEAL_MAX_MS=0` 注入时断言必须失败）验证脚本本身没失效；
  3. **主题锁定**：CDP 模拟 `prefers-color-scheme` × `data-theme`，断言 `color-scheme` 与 `--on-surface` 取值（18 组合可跑全量或抽 8 组）。
- **验收**：CI 绿；故意把 `showPanel` 改回「先清空再建」时第 2 项变红。

---

## P2 —— 体验与一致性（排期，攒批做）

- **P2-1 效果图说明与画面一致化**：`preview-blur.png` 里假桌面的圆是锐利的（页内元素不可能被 DWM 模糊），README 却标注「原生 Acrylic 模糊生效时」。改法任选：`html.demo-blur` 时给 `.demo-desktop` 的圆加真模糊（`filter: blur(28px)` 左右），或把说明改为「透明玻璃态（浏览器模拟）」。
- **P2-2 0.5px 边框高 DPI 实测**：WebView2 在 125% / 150% 缩放下 0.5px 的舍入行为不定，个别机器会淡到不可见（S2PNG 当年调高 outline 很可能就是逆向补偿）。实测；若确认淡，改 `1px` + 更低 alpha（观感相同、渲染可预期）。
- **P2-3 浅色模式截图与目检**：README 两张截图均为深色，亮暗成对变量是头部卖点却无浅色图。补两张；顺带目检浅色兜底渐变下卡片边界是否过淡（`surface-glass-light` 0.15 白 + 0.5px 低 alpha 边），必要时提浅色档 `--outline` 或光斑强度。
- **P2-4 纯函数单测**：`fmtSize` / `parseUtc` / `fmtIsoLocal` / `fmtRelativeDay` / `fmtDuration` / `timer` 全是纯函数，`node:test` 一个文件 + CI 一步即可；`parseUtc` 的 SQLite 无时区坑最适合用测试钉死。
- **P2-5 showPanel 状态机拆分**：全库最复杂的逻辑（token 竞态、待定面板、延迟揭示、超时路径）值得拆成可注入 fake DOM 的独立模块，P0-2 / P0-3 这类边界用单测锁住。与 P1-10 一起做最划算。
- **P2-6 视觉小项打包**：① `.btn` 加 `:active` 按压态（`transform: translateY(0)` + 微降亮度）；② `nav-item` / `toggle-btn` / `chip` 的 `transition: all` 换显式属性；③ `prefers-reduced-motion` 下同时关掉 `snackIn`；④ `.empty-state` 加可选图标插槽或虚线框。
- **P2-7 `icon(name)` helper**：`nav-icon` 支持 SVG 但套件不提供图标，各项目自备。提供返回内联 SVG（lucide 路径按需内嵌、`stroke: currentColor`）的小函数，消费方不必手搓；与 P3-8 联动。
- **P2-8 魔法数配置化**：`REVEAL_MAX_MS`（150ms）、`LOG_MAX`（2000）、snack 默认时长提为 `createShell` 选项或导出常量。
- **P2-9 `.chip` 键盘可达**：现在是 span + `cursor: pointer`，键盘用户点不到。换 `button`，或补 `tabindex="0"` + Enter/Space 处理。
- **P2-10 超宽屏内容上限**：≥1200px 断点后 `.panel.active` 全宽（`src/shell.css:277-280`），超宽屏文本行过长。给内容 ~1200px 舒适上限，表格类面板自行突破。
- **P2-11 snackbar / 错误卡片 aria**：`snack()` 加 `role="status"`（err 档 `role="alert"`）；`renderPanelError` 的卡片加 `role="alert"`。

---

## P3 —— 低优先（空闲时）

- **P3-1 侧栏窄窗口收成图标栏**：220px 固定，`minWidth: 940` 的窗口里占比不小。<900px 断点变纯图标栏（约 48px），hover 出 tooltip。
- **P3-2 关闭拦截路径**：`close_app_window` 直接 close，有长任务/未保存状态的应用想弹确认没地方挂。先验证 Tauri 的 `close()` 是否触发 `CloseRequested`，把结论与推荐做法写进 USAGE。
- **P3-3 CHANGELOG.md**：三个消费项目（+未来的）需要知道「这次回流修了什么」，手写一页即可。
- **P3-4 `.dot.off` 颜色语义**：红在语义上等于错误，「离线」用灰（`--on-surface-variant`）更直觉。按库内守则先实机确认再改，或在 REFERENCE 补一句理由。
- **P3-5 `--code-bg/-fg` 的归属**：套件内无组件使用（`--surface` 同样内部零引用）。补一个 `.code-block` 原语（背景 + 内边距 + 圆角 + 等宽 + 滚动）闭环，或在 REFERENCE 标注「对外令牌，套件自身不使用」。
- **P3-6 js_log 缓冲合并写**：每行一次 open/append/close，日志密集时有开销。可接受；真要优化就前端缓冲 + 定期 flush。
- **P3-7 格式化小一致性**：`fmtSize` 无 TB 档（2TB 显示 2048.00 GB）；`fmtTime` 空值返回 `-` 而 `fmtIsoLocal` 返回 `—`，统一之。
- **P3-8 demo 导航换 SVG 图标**：依赖 P2-7，替换 demo 里的 `A` / `B` / `L` 字母图标。

---

## 附一：建议的执行批次

| 批次 | 内容 | 预估 |
|---|---|---|
| 1 | P0 全部 + P1-7 + P1-8（缺陷与小修，一个下午） | ~1 小时 |
| 2 | P1-1 + P1-2 + P1-6 + P1-9（观感四件套，一次实机看完） | 半天 |
| 3 | P1-3 + P1-4 + P1-5（API 与日志） | 2 小时 |
| 4 | P1-10 + P2-4 + P2-5（护栏，一起做） | 1~2 天 |
| 5 | P2 其余 + P3，随版本窗口攒批 | — |

批次 2 改完记得跑两个自检脚本 + `cargo check`，并实机过一遍亮暗锁定。

## 附二：刻意设计，别顺手改

以下各项是踩坑后定下的，改前先读 README 第三节对应理由：

- 背景默认不透明、确认生效才转透明；兜底层是**页内一层**，不能写成 `<html>` 的 background。
- 命令必须放 Rust 子模块、不做 glob 重导出（E0255）。
- 亮暗成对变量组织 + 锁定块必须声明 `color-scheme`（`check-docs.py` 挡着）。
- `dark` 参数是必填 `bool`，「跟随系统」在前端解析成具体值（`apply_mica` 传 None 是「什么都不做」）。
- `indexmap` 双声明是环境适配，不是笔误。
- `.dot.on` 保持品牌色不改绿（视觉变更需实机确认）。
- `backdropBackend` 默认 `acrylic` 是为了与三个现有项目观感一致；要避 Win10 拖动卡顿让消费方传 `mica` / `auto`，不悄悄改默认。
- 面板入场动画只动 `transform` 不动 `opacity`；`REVEAL_MAX_MS` 的语义是「到点先给骨架，不让用户对着上一个界面发呆」。
