const fs = require('fs');
const path = require('path');

const dir = '/media/iveaghlow/Bridge/inflect-compliance/artif';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

// Simple but effective markdown-to-HTML using the marked library
let marked;
try { marked = require('marked'); } catch {
    console.error('Run: npm install marked');
    process.exit(1);
}

const style = `
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         max-width: 960px; margin: 40px auto; padding: 0 20px;
         background: #0d1117; color: #c9d1d9; line-height: 1.6; }
  h1, h2, h3 { color: #58a6ff; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #30363d; padding: 8px 12px; text-align: left; }
  th { background: #161b22; color: #58a6ff; }
  tr:nth-child(even) { background: #161b22; }
  code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #161b22; padding: 16px; border-radius: 8px; overflow-x: auto; }
  blockquote { border-left: 3px solid #58a6ff; margin: 16px 0; padding: 8px 16px; color: #8b949e; }
  a { color: #58a6ff; }
  strong { color: #e6edf3; }
</style>
`;

for (const file of files) {
    const md = fs.readFileSync(path.join(dir, file), 'utf-8');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${file}</title>${style}</head><body>${marked.parse(md)}</body></html>`;
    const out = path.join(dir, file.replace('.md', '.html'));
    fs.writeFileSync(out, html);
    console.log(`Created: ${out}`);
}
