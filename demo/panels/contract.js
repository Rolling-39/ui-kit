// 面板契约演示：mount / destroy / refresh 三个钩子的行为。
// 重点是 destroy —— 面板如果起了定时器或系统级监听，不显式停掉会一直在后台跑。
import { el, log, on, emit, snack } from '../../src/ui.js';

export function mount(root) {
    let ticks = 0;
    let unsub = null;

    const counter = el('span', { class: 'badge', text: '0 次' });

    // 模拟"面板打开时起的后台任务"
    const timerId = setInterval(() => {
        ticks++;
        counter.textContent = ticks + ' 次';
    }, 1000);

    // 模拟"订阅了全局事件"
    unsub = on('demo-event', (v) => log('收到 demo-event：' + v));

    root.append(
        el('div', { class: 'card' }, [
            el('div', { class: 'card-header', text: '面板契约' }),
            el('p', { class: 'hint', text:
                'export function mount(root) 里做的事情都会在切走时被回收 —— '
                + 'mount 返回 { destroy, refresh }。切走时 shell 会调 destroy()，'
                + '但它是异步回收、不阻塞新面板显示（刻意不 await，否则揭示会被清理拖住）。' }),
            el('div', { class: 'kv' }, [
                el('span', { class: 'k', text: '面板内定时器（每秒 +1，切走即停）' }),
                counter,
            ]),
        ]),

        el('div', { class: 'card' }, [
            el('div', { class: 'card-header', text: '生命周期' }),
            el('div', { class: 'btn-row' }, [
                el('button', {
                    class: 'btn btn-outline',
                    text: '触发 demo-event',
                    // 走事件总线（ui.js 的 emit）。写 window.dispatchEvent 是没用的：
                    // 那是 DOM 事件，进不了总线，下面 on('demo-event') 的订阅永远收不到，
                    // 而这个面板的卖点恰恰是演示总线。
                    onClick: () => { emit('demo-event', new Date().toLocaleTimeString()); snack('已触发'); },
                }),
                el('button', {
                    class: 'btn btn-outline',
                    text: '故意抛异常（看日志面板）',
                    onClick: () => { throw new Error('这是一个测试异常，会写进日志'); },
                }),
            ]),
            el('p', { class: 'hint', style: 'margin-top:10px', text:
                '抛出的异常会被 window.onerror 捕获并落到 frontend.log —— '
                + '桌面端没有控制台，白屏时这是唯一的线索来源。' }),
        ]),

        el('div', { class: 'card' }, [
            el('div', { class: 'card-header', text: '用 load 懒加载' }),
            el('p', { class: 'hint', text:
                '面板清单里写 load: () => import("./panels/xxx.js")，'
                + '面板只在第一次切到时才被下载和求值；'
                + '写 mount 则可以直接内联实现。两种都支持。' }),
        ]),
    );

    log('面板契约面板已挂载，后台定时器已启动');

    return {
        destroy() {
            clearInterval(timerId);
            if (unsub) unsub();
            log('面板契约面板已卸载，定时器与订阅已回收');
        },
        refresh() {
            log('收到 refresh 请求');
            snack('面板已刷新');
        },
    };
}
