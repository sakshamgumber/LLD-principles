#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const sourceSkillDir = path.resolve(packageRoot, 'skills', 'lld-first-engineering');

// Colors
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function printBanner() {
  console.log(`
${cyan(bold('┌────────────────────────────────────────────────────────┐'))}
${cyan(bold('│'))}  ${bold('📐 LLD-First Engineering')} - Skill Installer              ${cyan(bold('│'))}
${cyan(bold('│'))}  ${dim('Design-before-code workflow for AI coding assistants')}   ${cyan(bold('│'))}
${cyan(bold('└────────────────────────────────────────────────────────┘'))}
`);
}

function printHelp() {
  console.log(`
${bold('Usage:')}
  npx lld-first-engineering [options]

${bold('Options:')}
  -t, --target <env>    Target environment:
                        • antigravity        (workspace: .gemini/antigravity/skills)
                        • antigravity-global (user global: ~/.gemini/antigravity/skills)
                        • cursor             (workspace: .cursor/rules/)
                        • claude             (workspace: .claude/skills/)
                        • generic            (workspace: ./skills/lld-first-engineering)
  -d, --dest <path>     Custom destination folder path
  -y, --yes             Non-interactive mode (defaults to antigravity workspace)
  -h, --help            Show this help message
  -v, --version         Show package version

${bold('Examples:')}
  npx lld-first-engineering
  npx lld-first-engineering --target antigravity
  npx lld-first-engineering --target cursor
  npx lld-first-engineering --dest ./my-skills/lld
`);
}

function copyDirectory(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function installToCursor(targetDir) {
  const skillDest = path.join(targetDir, 'skills', 'lld-first-engineering');
  copyDirectory(sourceSkillDir, skillDest);

  // Also create a .cursor/rules/lld-first-engineering.mdc file for automatic Cursor activation
  const cursorRulesDir = path.join(targetDir, '.cursor', 'rules');
  fs.mkdirSync(cursorRulesDir, { recursive: true });

  const skillMdContent = fs.readFileSync(path.join(sourceSkillDir, 'SKILL.md'), 'utf-8');
  // Strip yaml frontmatter to place cursor frontmatter
  const bodyContent = skillMdContent.replace(/^---[\s\S]*?---\n*/, '');

  const cursorRuleContent = `---
description: LLD-First Engineering - Design before code workflow
globs: *
alwaysApply: true
---

# LLD-First Engineering

${bodyContent}

### References
Reference guides (SOLID, Design Patterns, Review Checklist) are available in:
\`skills/lld-first-engineering/references/\`
`;

  fs.writeFileSync(path.join(cursorRulesDir, 'lld-first-engineering.mdc'), cursorRuleContent, 'utf-8');
}

async function promptUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const options = {
    target: { type: 'string', short: 't' },
    dest: { type: 'string', short: 'd' },
    yes: { type: 'boolean', short: 'y', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  };

  let values;
  try {
    const parsed = parseArgs({ options, allowPositionals: true });
    values = parsed.values;
  } catch (err) {
    console.error(red(`Error: ${err.message}`));
    printHelp();
    process.exit(1);
  }

  if (values.help) {
    printBanner();
    printHelp();
    process.exit(0);
  }

  if (values.version) {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
    console.log(`v${pkgJson.version}`);
    process.exit(0);
  }

  printBanner();

  if (!fs.existsSync(sourceSkillDir)) {
    console.error(red(`❌ Error: Source skill directory not found at ${sourceSkillDir}`));
    process.exit(1);
  }

  const cwd = process.cwd();
  let target = values.target;
  let customDest = values.dest;

  // Interactive selection if no flag provided and not --yes
  if (!target && !customDest && !values.yes) {
    console.log(`${bold('Select target installation destination:')}\n`);
    console.log(`  ${cyan('1)')} ${bold('Antigravity (Current Workspace)')}`);
    console.log(`     ${dim('Path: .gemini/antigravity/skills/lld-first-engineering')}\n`);
    console.log(`  ${cyan('2)')} ${bold('Antigravity (Global - All Projects)')}`);
    console.log(`     ${dim('Path: ~/.gemini/antigravity/skills/lld-first-engineering')}\n`);
    console.log(`  ${cyan('3)')} ${bold('Cursor (.cursor/rules/)')}`);
    console.log(`     ${dim('Path: .cursor/rules/lld-first-engineering.mdc + skills folder')}\n`);
    console.log(`  ${cyan('4)')} ${bold('Claude Code (.claude/skills/)')}`);
    console.log(`     ${dim('Path: .claude/skills/lld-first-engineering')}\n`);
    console.log(`  ${cyan('5)')} ${bold('Generic Project Skills Directory')}`);
    console.log(`     ${dim('Path: ./skills/lld-first-engineering')}\n`);
    console.log(`  ${cyan('6)')} ${bold('Custom Path')}\n`);

    const answer = await promptUser(`${bold('Choice [1-6]')} (default: 1): `);

    switch (answer) {
      case '2':
        target = 'antigravity-global';
        break;
      case '3':
        target = 'cursor';
        break;
      case '4':
        target = 'claude';
        break;
      case '5':
        target = 'generic';
        break;
      case '6':
        customDest = await promptUser(`${bold('Enter destination path: ')}`);
        break;
      case '1':
      default:
        target = 'antigravity';
        break;
    }
  } else if (values.yes && !target && !customDest) {
    target = 'antigravity';
  }

  let finalDest = '';
  let isCursor = false;

  if (customDest) {
    finalDest = path.resolve(cwd, customDest);
  } else {
    switch (target) {
      case 'antigravity-global':
        finalDest = path.join(os.homedir(), '.gemini', 'antigravity', 'skills', 'lld-first-engineering');
        break;
      case 'cursor':
        isCursor = true;
        finalDest = cwd;
        break;
      case 'claude':
        finalDest = path.join(cwd, '.claude', 'skills', 'lld-first-engineering');
        break;
      case 'generic':
        finalDest = path.join(cwd, 'skills', 'lld-first-engineering');
        break;
      case 'antigravity':
      default:
        finalDest = path.join(cwd, '.gemini', 'antigravity', 'skills', 'lld-first-engineering');
        break;
    }
  }

  console.log(`\n📦 Installing to: ${cyan(finalDest)}...`);

  try {
    if (isCursor) {
      installToCursor(finalDest);
    } else {
      copyDirectory(sourceSkillDir, finalDest);
    }

    console.log(`\n${green(bold('✔ Installation complete!'))}`);
    console.log(`\n${bold('Next steps:')}`);
    if (isCursor) {
      console.log(`  • Rule created at ${cyan('.cursor/rules/lld-first-engineering.mdc')}`);
      console.log(`  • References copied to ${cyan('skills/lld-first-engineering/references/')}`);
      console.log(`  • Cursor will now automatically apply LLD rules during code generation.`);
    } else if (target === 'antigravity' || target === 'antigravity-global') {
      console.log(`  • Skill is now installed and will activate automatically whenever you design or refactor features.`);
      console.log(`  • You can test it by prompting: ${yellow('"Design a caching layer for user profiles using lld-first-engineering"')}`);
    } else {
      console.log(`  • Skill files copied successfully.`);
      console.log(`  • Point your AI coding agent to ${cyan(path.join(finalDest, 'SKILL.md'))}`);
    }
    console.log(`\n${dim('Happy architecting! 🚀')}\n`);
  } catch (err) {
    console.error(`\n${red(bold('✖ Installation failed:'))} ${err.message}\n`);
    process.exit(1);
  }
}

main();
