// 组件总览：把这套 UI 提供的原语都摆出来，方便对着看外观与状态。
import { el, snack, snackErr, snackWarn, log, timer, fmtSize, fmtTime, fmtDuration } from '../../src/ui.js';

function section(title, body) {
    return el('div', { class: 'card' }, [
        el('div', { class: 'card-header', text: title }),
        body,
    ]);
}

export function mount(root) {
    const t = timer();

    // ── 背景模式切换 ──
    const blurNote = el('p', { class: 'hint' });
    const blurTint = el('input', { class: 'range', type: 'range', min: '0', max: '100', value: '30' });
    const blurSwatch = el('div', {
        style: 'height:56px;border-radius:10px;border:0.5px solid var(--outline)',
    });
    const blurState = el('span', { class: 'badge' });
    const blurValueLabel = el('span', { class: 'label mono', text: '0.30' });

    function updateBlur() {
        const v = Number(blurTint.value) / 100;
        blurSwatch.style.background = `rgba(var(--primary-rgb), ${v.toFixed(2)})`;
        blurValueLabel.textContent = v.toFixed(2);
    }
    blurTint.addEventListener('input', updateBlur);

    const demoMode = el('div', { class: 'toggle-group', style: 'max-width:340px' }, [
        el('button', {
            class: 'toggle-btn',
            text: '看玻璃效果',
            onClick(e) {
                document.documentElement.classList.add('demo-blur');
                [...e.target.parentNode.children].forEach((b) => b.classList.remove('active'));
                e.target.classList.add('active');
                blurState.className = 'badge ok';
                blurState.textContent = '表面半透明，背景是"桌面"';
                log('预览切到：玻璃效果（模拟原生模糊生效）');
            },
        }),
        el('button', {
            class: 'toggle-btn active',
            text: '看兜底效果',
            onClick(e) {
                document.documentElement.classList.remove('demo-blur');
                [...e.target.parentNode.children].forEach((b) => b.classList.remove('active'));
                e.target.classList.add('active');
                blurState.className = 'badge warn';
                blurState.textContent = '表面半透明，背景是兜底底色';
                log('预览切到：不透明兜底（原生模糊不可用时的状态）');
            },
        }),
    ]);

    blurState.className = 'badge warn';
    blurState.textContent = '表面半透明，背景是兜底底色';
    blurNote.textContent =
        '同一套 CSS：有原生模糊时，玻璃后面的"桌面"是真实模糊过的；'
        + '没有原生模糊时，背景换成不透明兜底渐变，文字依然可读。'
        + '这就是 theme.js 默认走兜底、只有确认生效才转透明的原因。';

    updateBlur();

    root.append(
        section('窗口背景', el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, [
            demoMode,
            blurNote,
            el('div', { style: 'display:flex;gap:12px;align-items:center' }, [
                blurSwatch,
                blurState,
            ]),
            el('div', { class: 'field' }, [
                el('span', { class: 'label', text: '表面不透明度调参（真实效果靠 --surface-glass 等变量）' }),
                el('div', { style: 'display:flex;gap:12px;align-items:center' }, [
                    blurTint,
                    blurValueLabel,
                ]),
            ]),
        ])),

        section('按钮', el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
            el('div', { class: 'btn-row' }, [
                el('button', { class: 'btn btn-primary', text: '主要', onClick: () => snack('主要按钮') }),
                el('button', { class: 'btn btn-tonal', text: '色调', onClick: () => snack('色调按钮') }),
                el('button', { class: 'btn btn-outline', text: '描边', onClick: () => snack('描边按钮') }),
                el('button', { class: 'btn btn-text', text: '文字', onClick: () => snack('文字按钮') }),
                el('button', { class: 'btn btn-danger', text: '危险', onClick: () => snackErr('危险按钮') }),
                el('button', { class: 'btn btn-sm btn-outline', text: '小号', onClick: () => snack('小号') }),
                el('button', { class: 'btn btn-primary', text: '禁用', disabled: true }),
            ]),
            el('div', { class: 'btn-row fill' }, [
                el('button', { class: 'btn btn-primary', text: '撑满型（.btn-row.fill）', onClick: () => snack('撑满型按钮行') }),
                el('button', { class: 'btn btn-outline', text: '第二个', onClick: () => snack('第二个') }),
            ]),
        ])),

        section('输入', el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
            el('div', { class: 'field' }, [
                el('span', { class: 'label', text: '文本域 .textarea' }),
                el('textarea', { class: 'textarea', placeholder: '等宽字体，玻璃底' }),
            ]),
            el('div', { class: 'field' }, [
                el('span', { class: 'label', text: '单行 .input' }),
                el('input', { class: 'input', placeholder: 'placeholder 半透明' }),
            ]),
            el('div', { class: 'field' }, [
                el('span', { class: 'label', text: '下拉 .select（展开面板不跟随 CSS 变量，已显式给深色底）' }),
                el('select', { class: 'select' }, [
                    el('option', { text: '选项一' }),
                    el('option', { text: '选项二' }),
                ]),
            ]),
        ])),

        section('开关与标签', el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
            el('div', { class: 'toggle-group' }, [
                el('button', {
                    class: 'toggle-btn active',
                    text: '加密',
                    onClick(e) {
                        [...e.target.parentNode.children].forEach((b) => b.classList.remove('active'));
                        e.target.classList.add('active');
                    },
                }),
                el('button', {
                    class: 'toggle-btn',
                    text: '解密',
                    onClick(e) {
                        [...e.target.parentNode.children].forEach((b) => b.classList.remove('active'));
                        e.target.classList.add('active');
                    },
                }),
            ]),
            el('div', { class: 'chip-row' }, [
                el('span', { class: 'chip on', text: '已选' }),
                el('span', { class: 'chip', text: '未选' }),
                el('span', { class: 'bind-chip', text: 'Ctrl + A' }),
                el('span', { class: 'bind-chip none', text: '未绑定' }),
            ]),
            el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
                el('span', { class: 'badge', text: '默认' }),
                el('span', { class: 'badge ok', text: '成功' }),
                el('span', { class: 'badge warn', text: '警告' }),
                el('span', { class: 'badge err', text: '错误' }),
                el('span', { class: 'dot on' }), el('span', { class: 'label', text: '在线' }),
                el('span', { class: 'dot warn' }), el('span', { class: 'label', text: '待确认' }),
                el('span', { class: 'dot off' }), el('span', { class: 'label', text: '离线' }),
            ]),
        ])),

        section('数据展示', el('div', { style: 'display:flex;flex-direction:column;gap:16px' }, [
            el('div', { class: 'stat-grid' }, [
                el('div', { class: 'stat' }, [
                    el('div', { class: 'k', text: '文件大小' }),
                    el('div', { class: 'v' }, ['18.4', el('span', { class: 'u', text: 'MB' })]),
                ]),
                el('div', { class: 'stat' }, [
                    el('div', { class: 'k', text: '耗时' }),
                    el('div', { class: 'v' }, ['2.1', el('span', { class: 'u', text: 's' })]),
                ]),
                el('div', { class: 'stat' }, [
                    el('div', { class: 'k', text: '峰值内存' }),
                    el('div', { class: 'v' }, ['9.2', el('span', { class: 'u', text: 'MB' })]),
                ]),
            ]),
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: '输入' }), el('span', { class: 'v', text: 'a.txt' })]),
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: '输出' }), el('span', { class: 'v', text: 'a.txt.txt' })]),
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: '计时器 text()' }), el('span', { class: 'v', text: t.text() })]),
        ])),

        section('进度与结果', el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, [
            el('div', { class: 'progress-bar' }, [el('div', { class: 'progress-fill', style: 'width:42%' })]),
            el('div', { class: 'loading-row show' }, [
                el('span', { class: 'spinner' }),
                el('span', { class: 'label', text: '处理中…' }),
            ]),
            el('div', { class: 'result-list' }, [
                el('div', { class: 'result-item success' }, [
                    el('span', { class: 'icon', text: 'OK' }),
                    el('span', { class: 'name', text: 'photo.png' }),
                    el('span', { class: 'msg', text: '860 KB → 1.15 MB' }),
                ]),
                el('div', { class: 'result-item fail' }, [
                    el('span', { class: 'icon', text: '!!' }),
                    el('span', { class: 'name', text: 'broken.jpg' }),
                    el('span', { class: 'msg', text: '解码失败：非法的 Base64' }),
                ]),
            ]),
            el('div', { class: 'result-scroll' }, ['等宽字体结果区，可选中复制。\n'.repeat(3)]),
            el('div', { class: 'empty-state', text: '空状态：没有数据时用 .empty-state' }),
        ])),

        section('提示条', el('div', { class: 'btn-row' }, [
            el('button', { class: 'btn btn-outline', text: '成功提示', onClick: () => snack('操作完成') }),
            el('button', { class: 'btn btn-outline', text: '警告提示', onClick: () => snackWarn('有 3 项被跳过') }),
            el('button', { class: 'btn btn-outline', text: '错误提示', onClick: () => snackErr('写入失败：文件被占用') }),
        ])),

        section('格式化工具', el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, [
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'fmtSize(0)' }), el('span', { class: 'v', text: fmtSize(0) })]),
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'fmtSize(1536)' }), el('span', { class: 'v', text: fmtSize(1536) })]),
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'fmtSize(2147483648)' }), el('span', { class: 'v', text: fmtSize(2147483648) })]),
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'fmtDuration(95000)' }), el('span', { class: 'v', text: fmtDuration(95000) })]),
            el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'fmtTime(1759500000000)' }), el('span', { class: 'v', text: fmtTime(1759500000000) })]),
        ])),
    );

    log('组件总览已渲染');
    return {};
}
