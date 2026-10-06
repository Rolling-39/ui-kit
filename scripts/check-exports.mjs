// 校验 package.json 的 exports 映射都指向真实存在的文件。
//
// 为什么值得单独检：exports 写错不会让本仓库报错，只在消费方 import 时才炸，
// 而消费方在别的仓库里，报错信息也只会说"解析不到 @rolling/ui-kit/xxx"。
//
// 用法：
//   node scripts/check-exports.mjs                 # 检本仓库
//   node scripts/check-exports.mjs <包根目录>       # 检装到 node_modules 里的那份
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] ? resolve(process.argv[2]) : repoRoot;

let pkg;
try {
    pkg = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
} catch (e) {
    console.error(`读不到 ${join(base, 'package.json')}：${e.message}`);
    process.exit(1);
}

if (!pkg.exports || typeof pkg.exports !== 'object') {
    console.error(`package.json 没有 exports 字段（消费方将无法 import 任何子路径）`);
    process.exit(1);
}

const problems = [];
let count = 0;
for (const [key, val] of Object.entries(pkg.exports)) {
    const target = typeof val === 'string' ? val : Object.values(val)[0];
    if (!target) {
        problems.push(`${key} -> 无法解析出目标路径`);
        continue;
    }
    count += 1;
    if (!existsSync(join(base, target))) problems.push(`${key} -> ${target}`);
}

console.log(`检查 ${count} 个导出入口`);
console.log(`  基准目录：${base}`);
console.log(`  包名版本：${pkg.name || '(无名)'} ${pkg.version || ''}`);

if (problems.length) {
    console.error('\n以下导出指向不存在的文件（消费方 import 时会直接失败）：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('全部指向真实文件');
