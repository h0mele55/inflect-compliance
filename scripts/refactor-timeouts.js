const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tests/e2e');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

let totalReplaced = 0;

for (const f of files) {
  const file = path.join(dir, f);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const newLines = lines.map(line => {
    // Preserve the Next.js dev server cold start retry loop delays
    if (line.includes('if (await emailInput.isVisible') || 
        line.includes('await page.waitForTimeout(5000)') ||
        line.includes('if (attempts > 0) await page.waitForTimeout(3000)') ||
        line.includes('if (attempt < retries - 1) await page.waitForTimeout(2000)')) {
      return line;
    }
    
    // Replace all other hardcoded waits with a robust standard wait
    if (line.match(/await page\.waitForTimeout\(\d+\)/)) {
      totalReplaced++;
      if (line.includes('// let filtering settle') || line.includes('// debounced search filter') || line.includes('// Wait for plans list to load') || line.includes('// let hydration settle') || line.includes('// Let any redirects settle')) {
        return line.replace(/await page\.waitForTimeout\(\d+\).*$/, "await page.waitForLoadState('networkidle'); /* replaced wait */");
      }
      return line.replace(/await page\.waitForTimeout\(\d+\).*$/, "await page.waitForLoadState('networkidle');");
    }
    return line;
  });
  
  fs.writeFileSync(file, newLines.join('\n'));
}
console.log(`Replaced ${totalReplaced} timeouts across e2e tests.`);
