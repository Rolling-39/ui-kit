// ─────────────────────────────────────────────────────────────
// ui-kit / shell.js —— 窗口外壳：标题栏、侧栏导航、面板生命周期、路由
// ─────────────────────────────────────────────────────────────
// 各项目原先都要在自己的 main.js 里重复一遍：绑定三个窗口按钮、渲染导航、
// 维护 PANELS 表、动态 import 面板、切面板时清理上一个面板。这里收口成一次
// 调用，业务侧只提供"面板清单"。
//
// 面板模块契约：
//   export function mount(rootEl) { ... return { destroy?, refresh? } }
//   - destroy() 在切走前被 await：面板如果起了系统级监听线程/定时器，
//     不显式停掉会一直在后台跑（Keypad 的按键测试面板就是这种情况）。
//   - refresh() 由 shell.refresh() 调用。

import { minimizeWindow, toggleMaximizeWindow, closeWindow } from './tauri.js';
import { log, logPersist, installErrorReporter, $, el, clear } from './ui.js';
import { initBackdrop, watchColorScheme, isBackdropActive } from './theme.js';

const TEMPLATE_HINT = '页面缺少 .app 骨架，请对照 ui-kit/src/shell.template.html 补齐';

export async function createShell(options) {
    const {
        appName = 'App',
        sidebarTitle = appName,
        footer = '© Rolling',
        panels = {},
        defaultPanel = Object.keys(panels)[0],
        /** 'acrylic'（默认）| 'mica'（仅 Win11）| 'auto' */
        backdropBackend = 'acrylic',
        /** 置 false 可强制使用不透明兜底底色 */
        useBackdrop = true,
        /** 启动后空闲时预热其余面板模块，消除冷切换的动态 import 等待；置 false 关闭 */
        prefetchPanels = true,
        onReady = null,
    } = options || {};

    // 1) 前端异常落盘。必须最先装：骨架不对时抛出的错、之后任何白屏，
    //    桌面端都只能靠这份日志定位（没有控制台）。
    installErrorReporter();

    if (!Object.keys(panels).length) throw new Error('createShell 需要至少一个面板');

    // 2) 骨架检查：宁可当场抛错，也不要渲染出一个空壳让人以为 UI 坏了
    const nav = $('sidebarNav');
    const content = $('content');
    if (!nav || !content || !$('tbMin')) throw new Error(TEMPLATE_HINT);

    // 兜底底色层。模板里已经写了，写在这里是为了防"模板被改过"的情况：
    // 缺了它会变成完全透明的窗口 + 0.15 不透明的表面，文字糊在桌面上。
    if (!document.querySelector('.backdrop-fallback')) {
        document.body.insertBefore(
            el('div', { class: 'backdrop-fallback', 'aria-hidden': 'true' }),
            document.body.firstChild,
        );
        log('未找到 .backdrop-fallback，已自动补一层。建议写进 index.html 以保证首帧就有。');
    }

    // 3) 标题栏
    $('tbMin').addEventListener('click', minimizeWindow);
    $('tbMax').addEventListener('click', toggleMaximizeWindow);
    $('tbClose').addEventListener('click', closeWindow);

    // 4) 侧栏
    const titleEl = document.querySelector('.sidebar-title');
    if (titleEl) titleEl.textContent = sidebarTitle;
    const titlebarTitleEl = $('tbTitle');
    const footEl = document.querySelector('.sidebar-footer');
    if (footEl && footer) footEl.textContent = footer;

    const badgeEls = new Map();
    clear(nav);
    for (const [key, p] of Object.entries(panels)) {
        if (p.hidden) continue;
        // icon 支持两种形态：字符串（原有行为），或 SVG 元素（如 lucide 的
        // createElement 产物——单色、stroke=currentColor，颜色随主题联动）
        const iconWrap = el('span', { class: 'nav-icon' });
        if (p.icon instanceof Element) iconWrap.appendChild(p.icon);
        else iconWrap.textContent = p.icon || '';
        const btn = el('button', { class: 'nav-item', dataset: { panel: key } }, [
            iconWrap,
            p.title,
        ]);
        if (p.badge !== undefined && p.badge !== null) {
            btn.appendChild(el('span', { class: 'nav-badge', text: String(p.badge) }));
            badgeEls.set(key, btn.querySelector('.nav-badge'));
        }
        nav.appendChild(btn);
    }

    // 5) 面板切换
    let currentName = null;
    let currentPanel = null;
    let switchToken = 0;

    /** 揭示新面板前最多等多久（ms）。到点就先把当前的显示出来，
     *  让骨架/加载态自己给反馈 —— 慢面板不能让用户对着上一个界面发呆。 */
    const REVEAL_MAX_MS = 150;

    /** 回收一个面板手柄。刻意不 await：揭示画面不该被别的东西拖住。 */
    function safeDestroy(handle) {
        if (!handle || typeof handle.destroy !== 'function') return;
        try {
            Promise.resolve(handle.destroy()).catch((e) => log('清理面板失败：' + e));
        } catch (e) {
            log('清理面板失败：' + e);
        }
    }

    async function showPanel(name) {
        // hidden 只表示"不进导航"，显式 showPanel 仍可打开（与 USAGE 文档一致）
        if (!panels[name]) return;
        const token = ++switchToken;
        const p = panels[name];

        // ① 先把面板模块取到手，再动 DOM。
        //    反过来写（先清空、再等模块）会让"清空 → 等模块 → 建面板"之间内容区是空的。
        let mod = null;
        let loadErr = null;
        try {
            mod = p.mount ? { mount: p.mount } : await p.load();
        } catch (e) {
            loadErr = e;
        }
        if (token !== switchToken) return; // 等待期间又被切走，丢弃本次

        // ② 上一轮若留下未揭示的待定面板（切太快时），这里连它的手柄一起回收
        content.querySelectorAll('.panel-pending').forEach((n) => n.remove());

        // ③ 旧面板先留着。新面板没准备好之前就撤掉它，中间那段"骨架在、数据没到"
        //    会被看见 —— 那正是切换时"闪一下"的来源：截图里只剩 视图/分组/标签
        //    三个表头，卡片和详情栏都还是空的。
        const oldRoot = content.querySelector('.panel');
        const oldPanel = currentPanel;
        currentPanel = null;

        currentName = name;
        const root = el('section', { class: 'panel active' });
        root.id = 'panel-' + name;
        // 有旧面板时先以"待定"状态挂上：absolute + visibility:hidden，
        // 不参与布局（旧面板原地不动，界面纹丝不动），也不影响内部测量。
        const willSwap = !!oldRoot;
        if (willSwap) root.classList.add('panel-pending');
        content.appendChild(root);

        // ④ 导航与标题立刻更新：点下去就该有反馈，这部分与数据无关
        nav.querySelectorAll('.nav-item').forEach((b) => {
            const on = b.dataset.panel === name;
            b.classList.toggle('active', on);
            if (on) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });
        if (titlebarTitleEl) titlebarTitleEl.textContent = `${appName} - ${panels[name].title}`;
        document.title = `${appName} - ${panels[name].title}`;
        // 用 replaceState 而不是直接改 location.hash：后者会触发 hashchange，
        // 又被下面的监听接回来，形成回环。file:// 与部分沙箱环境里
        // replaceState 会抛错，失败就忽略（hash 只是个调试入口）。
        try {
            if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
        } catch (_) { /* 忽略 */ }

        // ⑤ 建面板。mount() 的 promise 落地 = 首屏已渲染（面板实现要保证这一点，
        //    ProjectHub 的 mountSection 就是 await 了首次 load）。等到了再揭示，
        //    这样"骨架已挂、数据没到"那一帧根本不会被画出来。
        let handle = null;
        const mounted = (async () => {
            if (loadErr) { renderPanelError(root, name, loadErr); return; }
            try {
                handle = (typeof mod.mount === 'function') ? await mod.mount(root) : null;
            } catch (e) {
                renderPanelError(root, name, e);
            }
        })();

        if (willSwap) {
            await Promise.race([mounted, new Promise((r) => setTimeout(r, REVEAL_MAX_MS))]);
            if (token !== switchToken) {
                // 等待期间又切走了：这块待定面板交给下一轮清掉，
                // 但手柄得等它建完再回收，否则会漏掉一次 destroy（订阅/定时器）。
                mounted.then(() => { if (token !== switchToken) safeDestroy(handle); });
                return;
            }
            // ⑥ 原子替换：撤旧 + 揭示 + 复位滚动，落在同一帧
            if (oldRoot.parentNode === content) oldRoot.remove();
            root.classList.remove('panel-pending');
            // 动画在揭示这一刻才挂上。挂在 .panel.active 上不行 ——
            // 待定阶段元素已存在，动画会在 hidden 时就跑完，揭示时什么都看不到。
            root.classList.add('panel-in');
            if (content.scrollTop !== 0) content.scrollTop = 0;
            if (oldPanel) safeDestroy(oldPanel);
        } else {
            // 启动时的第一个面板：没有旧面板可留，直接显示骨架（与改动前一致），
            // 别让应用窗口先空一段。
            await mounted;
            if (token !== switchToken) return;
            root.classList.add('panel-in');
            if (content.scrollTop !== 0) content.scrollTop = 0;
        }

        // 超时揭示时 mount 可能还没完，完成后把手柄补上
        mounted.then(() => { if (token === switchToken) currentPanel = handle; });
        currentPanel = handle;
    }

    /** 面板加载/挂载失败时的兜底卡片。桌面端没有控制台，界面必须自己说清楚。 */
    function renderPanelError(root, name, err) {
        logPersist(`加载面板 ${name} 失败：${err}`);
        root.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'card-header', text: '面板加载失败' }),
            el('p', { class: 'hint err-text', text: String(err) }),
        ]));
    }

    nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (!btn || !btn.dataset.panel) return;
        showPanel(btn.dataset.panel).catch((err) => log('切换面板失败：' + err));
    });

    window.addEventListener('hashchange', () => {
        const want = (location.hash || '').replace(/^#/, '');
        if (panels[want] && want !== currentName) showPanel(want);
    });

    const shell = {
        appName,
        panels,
        /** 当前面板名 */
        get activeName() { return currentName; },
        showPanel,
        /** 让当前面板重新读取数据 */
        refresh() {
            if (currentPanel && typeof currentPanel.refresh === 'function') {
                try { currentPanel.refresh(); } catch (e) { log('刷新面板失败：' + e); }
            }
        },
        /** 设置导航角标，传 null 移除 */
        setBadge(key, value) {
            let badge = badgeEls.get(key);
            if (value === null || value === undefined) {
                if (badge) { badge.remove(); badgeEls.delete(key); }
                return;
            }
            if (!badge) {
                const btn = nav.querySelector(`.nav-item[data-panel="${key}"]`);
                if (!btn) return;
                badge = el('span', { class: 'nav-badge' });
                btn.appendChild(badge);
                badgeEls.set(key, badge);
            }
            badge.textContent = String(value);
        },
    };

    // 6) 原生窗口背景
    await initBackdrop({ backend: backdropBackend, force: useBackdrop });
    watchColorScheme();

    // 7) 启动日志：桌面端无控制台，这段是事后定位"卡在哪一步"的唯一依据
    log(`=== ${appName} ===`);
    log(`运行环境：${isBackdropActive() ? 'Tauri 桌面端（原生模糊已生效）' : '浏览器或兜底背景'}`);
    log(`面板：${Object.keys(panels).join(' / ')}`);

    // 8) 支持 #面板名 直达（调试与分享链接用）
    const wanted = (location.hash || '').replace(/^#/, '');
    await showPanel(panels[wanted] && !panels[wanted].hidden ? wanted : defaultPanel);

    if (typeof onReady === 'function') await onReady(shell);

    // 9) 空闲时预热其余面板模块。
    //
    // 冷切换时那个动态 import 是要等的（本地读盘也要几十毫秒，桌面端被杀软扫过
    // 一次更慢），而这段等待正好落在"内容区已清空、新面板还没建"的窗口里。
    // 提前把模块拉进来，切换就只剩同步建 DOM 这一步。
    // 只 import 模块，不挂载面板 —— 不会提前建 DOM，也不会触发数据读取。
    // 放在 onReady 之后，避免和应用自己的启动工作抢时间片。
    if (prefetchPanels) {
        const warm = () => {
            Object.entries(panels).forEach(([key, p]) => {
                if (key === currentName || !p.load) return;
                p.load().catch(() => { /* 预热失败不报错，真切换时会按正常路径再报一次 */ });
            });
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 3000 });
        else setTimeout(warm, 800);
    }

    return shell;
}
