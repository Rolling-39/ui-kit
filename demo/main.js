// ui-kit 预览入口。演示 createShell 的用法与各组件外观。
import { createShell } from '../src/shell.js';
import { el, log, onLog, logText, clearLog, snack } from '../src/ui.js';

const shell = await createShell({
    appName: 'ui-kit 预览',
    sidebarTitle: 'ui-kit',
    panels: {
        showcase: { title: '组件', icon: 'A', load: () => import('./panels/showcase.js') },
        contract: { title: '面板契约', icon: 'B', load: () => import('./panels/contract.js') },
        log: {
            title: '日志',
            icon: 'L',
            mount(root) {
                const box = el('div', {
                    class: 'result-scroll',
                    id: 'logArea',
                    style: 'max-height:none;min-height:420px;font-size:11px',
                });
                box.textContent = logText();

                // 订阅式渲染：日志从任何地方产生都会同步到这里，
                // 不需要各业务代码自己去找 #logArea。
                const off = onLog((line, lines) => {
                    box.textContent = line ? lines.join('\n') : '';
                    box.scrollTop = box.scrollHeight;
                });

                root.appendChild(el('div', { class: 'card' }, [
                    el('div', { class: 'card-header', text: '运行日志' }),
                    box,
                    el('div', { class: 'btn-row' }, [
                        el('button', {
                            class: 'btn btn-tonal',
                            text: '复制日志',
                            onClick: async () => {
                                await navigator.clipboard?.writeText(logText());
                                snack('已复制');
                            },
                        }),
                        el('button', {
                            class: 'btn btn-text',
                            text: '清空',
                            onClick: () => { clearLog(); snack('已清空'); },
                        }),
                        el('button', {
                            class: 'btn btn-text',
                            text: '写一条测试日志',
                            onClick: () => log('测试日志 ' + new Date().toLocaleTimeString()),
                        }),
                    ]),
                ]));

                // 面板契约：切走时必须退订，否则每进一次日志面板就多一个订阅
                return { destroy: () => off() };
            },
        },
    },
    defaultPanel: 'showcase',
});

log('预览已就绪');
log(`环境：非 Tauri，窗口背景走不透明兜底（这是预期行为）`);
shell.setBadge('contract', 2);

// 方便截图与分享：?blur=1 直接进"玻璃效果"状态
const params = new URLSearchParams(location.search);
if (params.get('blur') === '1') {
    document.documentElement.classList.add('demo-blur');
    log('已按 URL 参数切到玻璃效果预览');
}
