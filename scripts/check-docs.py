#!/usr/bin/env python3
r"""ui-kit 文档与主题一致性检查。

做五件事：
  1. 校验所有 Markdown 内部链接与锚点能解析（锚点算法对齐 GitHub 的 github-slugger）
  2. 检出重复锚点（重复时链接会静默指向第一个）
  3. 校验文档里声称的 JS 导出 / Rust 命令 / CSS 变量 / CSS 类在源码里真实存在
  4. 校验 html[data-theme] 手动锁定块覆盖完整（含 color-scheme）
  5. 校验 shell.js 依赖的 id 钩子在模板与 USAGE 清单里都在

用法：
    python scripts/check-docs.py

退出码 0 = 全部通过；1 = 有问题。改完代码或文档都跑一遍，避免文档漂移。

第 3 条里"哪些文档允许提类名"有讲究：
  REFERENCE / USAGE / README —— 只允许提套件真实提供的类（它们是"怎么用套件"的文档）
  MIGRATION                  —— 不校验。它本来就要点名一批**业务类**（要从各项目里保留的，
                               如 device-card / stage-wrap），那些不属于套件，点名是它的职责。
"""

import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD_FILES = ['README.md'] + sorted(
    os.path.relpath(p, ROOT)
    for p in glob.glob(os.path.join(ROOT, 'docs', '*.md'))
)
# 这些文档里出现 `.xxx` 就必须是套件真有的类；MIGRATION 例外（见文件头说明）
CLASS_CHECK_DOCS = ['README.md', 'docs/REFERENCE.md', 'docs/USAGE.md']


def slug(heading: str) -> str:
    """按 GitHub（github-slugger）的规则生成锚点。

    注意：每个空格换成**一个**连字符，不折叠连续空格。
    `进度条 + 耗时` 去标点后是两个空格，锚点就是 `进度条--耗时`。
    这一点很容易和"折叠空白"的直觉算法搞混，写标题时尽量别用两侧带空格的符号。
    """
    s = heading.strip().lower().replace('`', '')
    s = re.sub(r'[^\w\u4e00-\u9fff \-]', '', s)
    return s.replace(' ', '-')


def read(rel):
    return io.open(os.path.join(ROOT, rel), encoding='utf-8').read()


def strip_comments(css: str) -> str:
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def block_of(text: str, opener: str) -> str:
    """取 opener 之后的第一个 { ... } 块的内容（按花括号配对）"""
    i = text.index(opener)
    j = text.index('{', i)
    depth = 0
    for k in range(j, len(text)):
        if text[k] == '{':
            depth += 1
        elif text[k] == '}':
            depth -= 1
            if depth == 0:
                return text[j + 1:k]
    raise ValueError('花括号未闭合：' + opener)


def parse_vars(text: str):
    """取一段 CSS 里的 --var: value; 映射"""
    return {m.group(1): m.group(2).strip()
            for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;}]+)', text)}


def check_links():
    anchors = {}
    dupes = {}
    for f in MD_FILES:
        hs = [h for _, h in re.findall(r'^(#{1,6})\s+(.+)$', read(f), re.M)]
        slugs = [slug(h) for h in hs]
        anchors[f] = set(slugs)
        d = sorted({x for x in slugs if slugs.count(x) > 1})
        if d:
            dupes[f] = d

    problems = []
    total = 0
    for f in MD_FILES:
        for m in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)', read(f)):
            target = m.group(2)
            if target.startswith(('http', 'mailto:')):
                continue
            total += 1
            path, _, frag = target.partition('#')
            tgt = os.path.normpath(os.path.join(os.path.dirname(f), path)) if path else f
            if not os.path.exists(os.path.join(ROOT, tgt)):
                problems.append(f'{f}: 链接的文件不存在 -> {target}')
                continue
            if frag and frag not in anchors.get(tgt, set()):
                problems.append(f'{f}: 锚点不存在 -> {target}')
    return problems, dupes, total


def check_claims():
    """文档里点名提到的符号，必须真的在源码里。"""
    js = '\n'.join(read(os.path.relpath(p, ROOT))
                    for p in glob.glob(os.path.join(ROOT, 'src', '*.js')))
    rs_cmd = read('rust/src/commands.rs')
    rs_lib = read('rust/src/lib.rs')
    css = '\n'.join(read(os.path.relpath(p, ROOT)) for p in
                    [os.path.join(ROOT, 'src', n) for n in
                     ('tokens.css', 'shell.css', 'glass.css')])

    declared = lambda name: (
        f'export function {name}' in js
        or f'export async function {name}' in js
        or f'export const {name}' in js
        or f'export let {name}' in js
    )

    problems = []

    js_names = [
        'el', '$', '$$', 'clear', 'snack', 'snackErr', 'snackWarn',
        'log', 'logPersist', 'logText', 'clearLog', 'onLog', 'installErrorReporter',
        'fmtSize', 'fmtTime', 'fmtDuration', 'timer', 'on', 'emit',
        'parseUtc', 'fmtIsoLocal', 'fmtRelativeDay',
        'isTauri', 'invoke', 'invokeOr', 'listen', 'openDialog', 'saveDialog',
        'minimizeWindow', 'toggleMaximizeWindow', 'closeWindow', 'jsLog',
        'frontendLogPath', 'applyBackdrop',
        'readBackdropTint', 'readBackdropDarkness', 'initBackdrop', 'isBackdropActive',
        'isBackdropForced', 'isThemeLocked', 'watchColorScheme', 'refreshBackdrop', 'createShell',
    ]
    for n in js_names:
        if not declared(n):
            problems.append(f'文档声称的 JS 导出不存在：{n}')

    rust_names = [
        'ui_kit_apply_backdrop', 'ui_kit_clear_backdrop', 'minimize_window',
        'toggle_maximize_window', 'close_app_window', 'js_log', 'frontend_log_path',
    ]
    for n in rust_names:
        if f'fn {n}' not in rs_cmd:
            problems.append(f'文档声称的 Rust 命令不存在：{n}')

    for n in ['boot_log', 'spawn_ready_probe', 'append_frontend_log', 'frontend_log_path_of']:
        if f'fn {n}' not in rs_lib:
            problems.append(f'文档声称的 Rust 辅助函数不存在：{n}')

    # CSS 变量：文档里以 `--xxx` 形式出现的，都得在 tokens.css 里定义
    for var in sorted(set(re.findall(r'`(--[\w-]+)`', read('docs/REFERENCE.md')))):
        if f'{var}:' not in css:
            problems.append(f'文档提到的 CSS 变量未定义：{var}')

    # CSS 类：这几份文档里以 `.xxx` 形式出现的，都得在样式里出现
    for doc in CLASS_CHECK_DOCS:
        for cls in sorted(set(re.findall(r'`\.([a-z][\w-]*)`', read(doc)))):
            if f'.{cls}' not in css:
                problems.append(f'{doc} 提到的 CSS 类未定义：.{cls}')

    return problems


def check_theme_lock():
    r"""校验手动锁定块覆盖完整。

    kit 的深色值来自 @media (prefers-color-scheme: dark)，而 media 查询不看
    data-theme。所以 html[data-theme] 块必须把"亮暗取值不同"的变量全部重声明
    一遍，否则"系统暗 + 手动锁亮"会得到暗表面配亮背景的杂交态。
    color-scheme 也必须一起声明：它决定原生绘制控件的亮暗档位，且不随变量联动。
    """
    tokens = strip_comments(read('src/tokens.css'))
    light = parse_vars(block_of(tokens, ':root'))
    media = block_of(tokens, '@media (prefers-color-scheme: dark)')
    dark = parse_vars(block_of(media, ':root'))
    differ = {k for k, v in dark.items() if light.get(k) != v}

    problems = []
    for name in ('light', 'dark'):
        blk = block_of(tokens, 'html[data-theme="%s"]' % name)
        declared = parse_vars(blk)
        missing = sorted(differ - set(declared))
        if missing:
            problems.append(
                'tokens.css 的 html[data-theme="%s"] 漏了 %d 个亮暗有别变量：%s'
                % (name, len(missing), ', '.join(missing)))
        if 'color-scheme' not in blk:
            problems.append(
                'tokens.css 的 html[data-theme="%s"] 没有声明 color-scheme'
                '（原生绘制控件不会跟着锁定，等于只修了一半）' % name)
    return problems, len(differ)


def check_shell_hooks():
    """shell.js 依赖的 id 钩子，模板与 USAGE 清单里都得有"""
    shell = read('src/shell.js')
    tmpl = read('src/shell.template.html')
    usage = read('docs/USAGE.md')
    ids = sorted(set(re.findall(r"""\$\(['"]([\w-]+)['"]\)""", shell)))
    problems = []
    for i in ids:
        if 'id="%s"' % i not in tmpl:
            problems.append(f'shell.js 依赖的 id 不在 shell.template.html 里：{i}')
        if i not in usage:
            problems.append(f'USAGE.md 没有提到 shell.js 依赖的 id：{i}')
    return problems, len(ids)


def dead_code():
    """报出「定义了但从未被引用」的令牌与类。

    对库来说这两类不一定是错误（消费者可能用），所以只提示、不判失败。
    但它们最容易在改样式时变成垃圾，所以值得每次都看一眼。
    出现在文档里的类算「有意对外提供」，不提示。
    成对变量（--x-light / --x-dark）被同文件的 var() 引用，不会被误报。
    """
    css_files = ['tokens.css', 'shell.css', 'glass.css']
    css = '\n'.join(read('src/' + n) for n in css_files)
    js = '\n'.join(read(os.path.relpath(p, ROOT))
                   for p in glob.glob(os.path.join(ROOT, 'src', '*.js')))
    docs = '\n'.join(read(f) for f in MD_FILES)

    tokens = sorted(set(re.findall(r'^\s*(--[\w-]+):', read('src/tokens.css'), re.M)))
    # 令牌可能被 CSS 的 var() 用到，也可能被 JS 用 getComputedStyle 读走，
    # 还可能是"有意对外提供、给消费方用的"（文档里点名了就算，例如 --code-bg）
    unused_tokens = [t for t in tokens
                     if f'var({t}' not in css and f'var({t},' not in css
                     and t not in js and t not in docs]

    used_src = js + '\n'.join(
        read(os.path.relpath(p, ROOT)) for p in
        glob.glob(os.path.join(ROOT, 'demo', '**', '*.*'), recursive=True)
        # demo 里有截图，只读文本文件
        if os.path.splitext(p)[1] in ('.js', '.html', '.css'))
    used_src += read('src/shell.template.html')
    classes = sorted(set(re.findall(r'^\s*\.([a-zA-Z][\w-]*)', css, re.M)))
    never_used = [c for c in classes if c not in used_src and f'.{c}' not in docs]

    return unused_tokens, never_used


def main():
    link_problems, dupes, total = check_links()
    claim_problems = check_claims()
    lock_problems, differ_n = check_theme_lock()
    hook_problems, hooks_n = check_shell_hooks()
    unused_tokens, never_used = dead_code()

    print(f'检查 {len(MD_FILES)} 个文档，{total} 个内部链接')
    for f in MD_FILES:
        print(f'  {f}')
    print(f'主题锁定：{differ_n} 个亮暗有别变量，须被 light/dark 两块全部覆盖')
    print(f'shell 钩子：{hooks_n} 个 id 须同时出现在模板与 USAGE 清单')

    if dupes:
        print('\n重复锚点（链接会静默指向第一个）：')
        for f, d in dupes.items():
            print(f'  {f}: {", ".join(d)}')

    all_problems = link_problems + claim_problems + lock_problems + hook_problems
    if all_problems:
        print(f'\n发现 {len(all_problems)} 个问题：')
        for p in all_problems:
            print('  ✗ ' + p)

    if unused_tokens or never_used:
        # 只提示不失败：库允许存在当前项目用不到的令牌与类
        if unused_tokens:
            print('\n提示：定义了但没有任何地方引用的 CSS 变量（确认是残留还是预留给使用者）')
            print('  ' + ', '.join(unused_tokens))
        if never_used:
            print('\n提示：定义了但代码与文档里都没出现的 CSS 类（同上）')
            print('  ' + ', '.join(never_used))

    if not all_problems:
        print('\n通过：链接与锚点全部可解析；文档声称的 API / 变量 / 类均存在；'
              '主题锁定块覆盖完整且声明了 color-scheme；shell 钩子一致')
    return 1 if all_problems else 0


if __name__ == '__main__':
    sys.exit(main())
