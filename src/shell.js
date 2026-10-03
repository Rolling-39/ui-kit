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
        onReady = null,
    } = options || {};

    if (!Object.keys(panels).length) throw new Error('createShell 需要至少一个面板');

    // 1) 骨架检查：宁可当场抛错，也不要渲染出一个空壳让人以为 UI 坏了
    const nav = $('sidebarNav');
    const content = $('content');
    if (!nav || !content || !$('tbMin')) throw new Error(TEMPLATE_HINT);

    // 2) 前端异常落盘（必须在其他初始化之前，才能抓到后面所有错误）
    installErrorReporter();

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
        const btn = el('button', { class: 'nav-item', dataset: { panel: key } }, [
            el('span', { class: 'nav-icon', text: p.icon || '' }),
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

    async function destroyCurrent() {
        if (currentPanel && typeof currentPanel.destroy === 'function') {
            try { await currentPanel.destroy(); } catch (e) { log('清理面板失败：' + e); }
        }
        currentPanel = null;
    }

    async function showPanel(name) {
        if (!panels[name] || panels[name].hidden) return;
        const token = ++switchToken;

        await destroyCurrent();
        if (token !== switchToken) return; // 切换过程中又被切走，丢弃本次

        currentName = name;
        clear(content);
        const root = el('section', { class: 'panel active' });
        root.id = 'panel-' + name;
        content.appendChild(root);

        nav.querySelectorAll('.nav-item').forEach((b) => {
            b.classList.toggle('active', b.dataset.panel === name);
        });
        if (titlebarTitleEl) titlebarTitleEl.textContent = `${appName} - ${panels[name].title}`;
        document.title = `${appName} - ${panels[name].title}`;
        if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);

        try {
            const p = panels[name];
            const mod = p.mount ? { mount: p.mount } : await p.load();
            if (token !== switchToken) return;
            currentPanel = (typeof mod.mount === 'function') ? await mod.mount(root) : null;
        } catch (e) {
            currentPanel = null;
            logPersist(`加载面板 ${name} 失败：${e}`);
            root.appendChild(el('div', { class: 'card' }, [
                el('div', { class: 'card-header', text: '面板加载失败' }),
                el('p', { class: 'hint err-text', text: String(e) }),
            ]));
        }
    }

    nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (!btn || !btn.dataset.panel) return;
        showPanel(btn.dataset.panel);
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
    return shell;
}
