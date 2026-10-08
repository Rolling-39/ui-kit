// 行为验证探针。由 tests/browser.mjs 通过 query 驱动：
//   ?s=good|hang|leak    场景
//   ?nobackdrop=1        useBackdrop: false
//   ?skip=tbTitle,tbMax  故意缺省某些骨架钩子
const q = new URLSearchParams(location.search);
const scenario = q.get('s') || 'good';
const skip = (q.get('skip') || '').split(',').filter(Boolean);
const noBackdrop = q.get('nobackdrop') === '1';
const has = (id) => !skip.includes(id);

window.__probe = {
    scenario, skip, ready: false, ok: null, err: null,
    kicks: 0, destroyed: 0, ticks: 0,
};

// 必须在 import shell 之前挂桩：tauri.js 的 isTauri 是模块初始化时定的
window.__probeCalls = [];
window.__TAURI__ = {
    core: {
        invoke(cmd, args) {
            window.__probeCalls.push({ cmd, args: args ? structuredClone(args) : null });
            if (cmd === 'ui_kit_apply_backdrop') {
                // 假装原生模糊生效，但后端控制不了明暗
                return Promise.resolve({
                    applied: true, backend: 'acrylic', os_build: 26200,
                    detail: '', dark_honored: false,
                });
            }
            return Promise.resolve(null);
        },
    },
    event: { listen: () => Promise.resolve(() => {}) },
};

document.body.innerHTML = [
    '<div class="backdrop-fallback" aria-hidden="true"></div>',
    '<div class="app">',
    '  <header class="titlebar" data-tauri-drag-region>',
    has('tbTitle') ? '<span class="titlebar-title" id="tbTitle">probe</span>' : '',
    '    <div class="titlebar-controls">',
    has('tbMin') ? '<button class="tb-btn" id="tbMin">-</button>' : '',
    has('tbMax') ? '<button class="tb-btn" id="tbMax">+</button>' : '',
    has('tbClose') ? '<button class="tb-btn tb-close" id="tbClose">x</button>' : '',
    '    </div>',
    '  </header>',
    '  <div class="app-body">',
    '    <aside class="sidebar">',
    '      <div class="sidebar-title">probe</div>',
    has('sidebarNav') ? '<nav class="sidebar-nav" id="sidebarNav"></nav>' : '',
    '      <div class="sidebar-footer">© Rolling</div>',
    '    </aside>',
    has('content') ? '<main class="content" id="content"></main>' : '',
    '  </div>',
    '</div>',
].join('\n');

// 动态 import：静态 import 会被提升到模块体之前执行，桩就挂晚了
const { createShell } = await import('../src/shell.js');

const card = (t) => Object.assign(document.createElement('div'), { className: 'card', textContent: t });

const panels = {
    good: {
        title: '正常', icon: 'G',
        mount: async (root) => {
            root.appendChild(card('正常面板'));
            return { destroy() { window.__probe.destroyed++; } };
        },
    },
};

if (scenario === 'hang') {
    // 首面板 mount 永不 resolve
    panels.hang = { title: '挂死', icon: 'H', mount: () => new Promise(() => {}) };
}

if (scenario === 'leak') {
    // 首面板 mount 慢，等它的窗口里点别的导航项
    panels.slowA = {
        title: '慢A', icon: 'A',
        mount: async (root) => {
            root.appendChild(card('慢面板'));
            const t = setInterval(() => { window.__probe.ticks++; }, 100);
            await new Promise((r) => setTimeout(r, 2500));
            return { destroy() { clearInterval(t); window.__probe.destroyed++; } };
        },
    };
    const kick = () => {
        const b = document.querySelector('.nav-item[data-panel="good"]');
        if (b) { b.click(); window.__probe.kicks++; }
        else setTimeout(kick, 5);
    };
    setTimeout(kick, 120);
}

try {
    const shell = await createShell({
        appName: 'probe',
        sidebarTitle: 'probe',
        panels,
        defaultPanel: scenario === 'hang' ? 'hang' : (scenario === 'leak' ? 'slowA' : 'good'),
        useBackdrop: !noBackdrop,
        prefetchPanels: false,
    });
    window.__shell = shell;
    window.__probe.ok = true;
    window.__probe.ready = true;
} catch (e) {
    window.__probe.ok = false;
    window.__probe.err = String((e && e.message) || e);
}
