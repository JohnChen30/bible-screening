/**
 * report.mjs — 导入运行报告收集器
 *
 * 设计目标：单个文件解析失败绝不中断整轮导入；
 * 所有问题分级记录，结束时输出人类可读摘要 + 机器可读 JSON。
 */

const MAX_DETAIL = 500; // detail_json 落库截断上限

export class ImportReport {
  constructor(versionCode) {
    this.versionCode = versionCode;
    /** @type {{level:'info'|'warn'|'error', stage:string, message:string}[]} */
    this.entries = [];
  }

  info(stage, message) { this.entries.push({ level: 'info', stage, message }); }
  warn(stage, message) { this.entries.push({ level: 'warn', stage, message }); }
  error(stage, message) { this.entries.push({ level: 'error', stage, message }); }

  get warnings() { return this.entries.filter((e) => e.level === 'warn'); }
  get errors() { return this.entries.filter((e) => e.level === 'error'); }

  /** 结构化明细（截断） */
  toDetailJson() {
    return JSON.stringify(this.entries.slice(0, MAX_DETAIL));
  }

  /** 人类可读摘要（终端打印） */
  printSummary(extra = {}) {
    const { warnings, errors } = this;
    const lines = [];
    lines.push(`── 导入报告 [${this.versionCode}] ${'─'.repeat(Math.max(0, 40 - this.versionCode.length))}`);
    for (const [k, v] of Object.entries(extra)) lines.push(`   ${k}: ${v}`);
    if (errors.length) {
      lines.push(`   ✗ 错误 ${errors.length} 条：`);
      for (const e of errors.slice(0, 20)) lines.push(`     [${e.stage}] ${e.message}`);
    }
    if (warnings.length) {
      lines.push(`   ⚠ 警告 ${warnings.length} 条：`);
      for (const w of warnings.slice(0, 20)) lines.push(`     [${w.stage}] ${w.message}`);
      if (warnings.length > 20) lines.push(`     …另有 ${warnings.length - 20} 条`);
    }
    if (!errors.length && !warnings.length) lines.push('   ✓ 无警告、无错误');
    return lines.join('\n');
  }
}
