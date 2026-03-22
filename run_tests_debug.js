const { execSync } = require('child_process');
const fs = require('fs');

function runTest(file, outName) {
  try {
    execSync(`npx jest ${file}`, { stdio: 'pipe', encoding: 'utf8' });
    fs.writeFileSync(outName, 'PASS\n');
  } catch (e) {
    fs.writeFileSync(outName, (e.stdout || '') + '\n' + (e.stderr || ''));
  }
}

runTest('tests/guardrails/no-emoji-icons.test.ts', 'err_emoji.txt');
runTest('tests/unit/no-fallbacks.test.ts', 'err_fallbacks.txt');
runTest('tests/guardrails/responsive-tokens.test.ts', 'err_responsive.txt');
runTest('tests/guards/no-untyped-api-response.test.ts', 'err_untyped.txt');
