#!/usr/bin/env python3
"""ui-kit 文档一致性检查。

做三件事：
  1. 校验所有 Markdown 内部链接与锚点能解析（锚点算法对齐 GitHub 的 github-slugger）
  2. 检出重复锚点（重复时链接会静默指向第一个）
  3. 校验文档里声称的 JS 导出 / Rust 命令 / CSS 变量 / CSS 类在源码里真实存在

用法：
    python scripts/check-docs.py

退出码 0 = 全部通过；1 = 有问题。改完代码或文档都跑一遍，避免文档漂移。
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
        'isTauri', 'invoke', 'invokeOr', 'listen', 'openDialog', 'saveDialog',
        'minimizeWindow', 'toggleMaximizeWindow', 'closeWindow', 'jsLog',
        'frontendLogPath', 'applyBackdrop',
        'readBackdropTint', 'initBackdrop', 'isBackdropActive',
        'watchColorScheme', 'refreshBackdrop', 'createShell',
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

    # CSS 变量：文档里以 --xxx 形式出现的，都得在 tokens.css 里定义
    for var in sorted(set(re.findall(r'`(--[\w-]+)`', read('docs/REFERENCE.md')))):
        if f'{var}:' not in css:
            problems.append(f'文档提到的 CSS 变量未定义：{var}')

    # CSS 类：REFERENCE 的类表格里以 `.xxx` 形式出现的，都得在样式里出现
    for cls in sorted(set(re.findall(r'`\.([a-z][\w-]*)`', read('docs/REFERENCE.md')))):
        if f'.{cls}' not in css:
            problems.append(f'文档提到的 CSS 类未定义：.{cls}')

    return problems


def main():
    link_problems, dupes, total = check_links()
    claim_problems = check_claims()

    print(f'检查 {len(MD_FILES)} 个文档，{total} 个内部链接')
    for f in MD_FILES:
        print(f'  {f}')

    if dupes:
        print('\n重复锚点（链接会静默指向第一个）：')
        for f, d in dupes.items():
            print(f'  {f}: {", ".join(d)}')

    all_problems = link_problems + claim_problems
    if all_problems:
        print(f'\n发现 {len(all_problems)} 个问题：')
        for p in all_problems:
            print('  ✗ ' + p)
        return 1

    print('\n通过：链接与锚点全部可解析，文档声称的 API / 变量 / 类均存在')
    return 0


if __name__ == '__main__':
    sys.exit(main())
