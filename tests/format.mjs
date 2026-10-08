// 纯函数单测（node:test）。用法：node --test tests/format.mjs
//
// 这一组全是无副作用的纯函数，最适合用测试把行为钉死 ——
// 尤其是 parseUtc 那个"SQLite 的无时区时间串会被当成 UTC"的坑。
//
// 时区相关的断言一律按**运行时的本地时区**推算期望值，不写死字符串：
// 本地是东八区、CI runner 是 UTC，写死必然有一边挂。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    fmtSize, fmtTime, fmtDuration, fmtIsoLocal, fmtRelativeDay, parseUtc, timer,
} from '../src/ui.js';

test('fmtSize 各档位与边界', () => {
    assert.equal(fmtSize(0), '0 B');
    assert.equal(fmtSize(512), '512 B');
    assert.equal(fmtSize(1023), '1023 B');
    assert.equal(fmtSize(1024), '1.0 KB');
    assert.equal(fmtSize(1536), '1.5 KB');
    assert.equal(fmtSize(1048575), '1024.0 KB');
    assert.equal(fmtSize(1048576), '1.00 MB');
    assert.equal(fmtSize(1073741824), '1.00 GB');
    // 已知行为（OPTIMIZATION P3-7）：没有 TB 档，超大值会显示成很大的 GB
    assert.equal(fmtSize(2199023255552), '2048.00 GB');
    // 非法输入按 0 处理
    assert.equal(fmtSize(null), '0 B');
    assert.equal(fmtSize('abc'), '0 B');
});

test('parseUtc 把无时区的时间串按 UTC 解析（SQLite 格式）', () => {
    // 带 Z：JS 本来就按 UTC 解析
    const iso = parseUtc('2026-10-05T12:00:00.000Z');
    assert.equal(iso.toISOString(), '2026-10-05T12:00:00.000Z');

    // SQLite 的 datetime('now') 格式：空格分隔、无时区。
    // 直接 new Date() 会按**本地时间**解析，白白丢一个时区偏移 —— 这是那个坑。
    const sq = parseUtc('2026-10-05 12:00:00');
    assert.equal(sq.toISOString(), '2026-10-05T12:00:00.000Z');

    // 不带秒也能解析
    assert.equal(parseUtc('2026-10-05 12:00').toISOString(), '2026-10-05T12:00:00.000Z');

    // 空值 / 无法解析
    assert.equal(parseUtc(''), null);
    assert.equal(parseUtc(null), null);
    assert.equal(parseUtc('   '), null);
    assert.equal(parseUtc('不是时间'), null);
});

test('fmtIsoLocal 按本地时区渲染（不 slice 字符串）', () => {
    const iso = '2026-10-05T12:00:00.000Z';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

    assert.equal(fmtIsoLocal(iso), `${date} ${p(d.getHours())}:${p(d.getMinutes())}`);
    assert.equal(fmtIsoLocal(iso, { seconds: true }),
        `${date} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    assert.equal(fmtIsoLocal(iso, { dateOnly: true }), date);

    // 空值：默认 em dash；传了 fallback 就用传入的
    assert.equal(fmtIsoLocal(null), '—');
    assert.equal(fmtIsoLocal(null, { fallback: '未记录' }), '未记录');
    // 无法解析但非空时，原样返回，不假装成有效时间
    assert.equal(fmtIsoLocal('坏数据'), '坏数据');
});

test('fmtRelativeDay 的相对天数', () => {
    const ago = (days) => new Date(Date.now() - days * 86400000 - 1000).toISOString();
    assert.equal(fmtRelativeDay(ago(0)), '今天');
    assert.equal(fmtRelativeDay(ago(1)), '昨天');
    assert.equal(fmtRelativeDay(ago(5)), '5 天前');
    assert.equal(fmtRelativeDay(ago(29)), '29 天前');
    // 超过 30 天回落成绝对日期
    const old = fmtRelativeDay(ago(40));
    assert.match(old, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(fmtRelativeDay(null), '从未');
    assert.equal(fmtRelativeDay(null, '还没有'), '还没有');
});

test('fmtDuration 秒与分', () => {
    assert.equal(fmtDuration(0), '0.0s');
    assert.equal(fmtDuration(1000), '1.0s');
    assert.equal(fmtDuration(45500), '45.5s');
    assert.equal(fmtDuration(60000), '1m00s');
    assert.equal(fmtDuration(125000), '2m05s');
});

test('fmtTime 的空值符号与 fmtIsoLocal 不同（已知不一致，P3-7）', () => {
    // 这两个函数对空值用了不同的符号：'-'（ASCII）与 '—'（em dash）。
    // 不是 bug，但用在这里的断言把它固定下来，改的时候会有人注意到。
    assert.equal(fmtTime(0), '-');
    assert.equal(fmtTime(null), '-');
    assert.equal(fmtIsoLocal(null), '—');
});

test('timer 的 ms / sec / text 一致', async () => {
    const t = timer();
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(t.ms >= 50, `ms 应 >= 50，实际 ${t.ms}`);
    assert.ok(Math.abs(t.sec * 1000 - t.ms) < 2, 'sec 与 ms 应当一致');
    assert.equal(t.text(), fmtDuration(t.ms));
});
