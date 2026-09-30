// Sign in through the real form, then screenshot every page at three widths and flag overlapping text boxes.
const { chromium } = require(process.env.HOME + '/Developer/steward-video/pw/node_modules/playwright');
const fs = require('fs');
const vars = JSON.parse(fs.readFileSync(process.env.HOME + '/Developer/steward-video/clips/vars.json', 'utf8'));
const B = 'http://localhost:3000';
const overlapJS = () => {
  // leaf elements with visible text; report pairs whose boxes intersect by more than 4px in both axes
  const els = [...document.querySelectorAll('body *')].filter((e) => {
    if (!e.childNodes.length) return false;
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) return false;
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.opacity !== '0' && !e.closest('[aria-hidden="true"]');
  });
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.contains(b) || b.contains(a)) continue;
    const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
    const ox = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left), oy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
    if (ox > 4 && oy > 4) out.push(`${a.tagName}"${a.textContent.trim().slice(0, 40)}" x ${b.tagName}"${b.textContent.trim().slice(0, 40)}"`);
  }
  // horizontal overflow of the page
  const ow = document.documentElement.scrollWidth > window.innerWidth + 1 ? [`page scrolls sideways: ${document.documentElement.scrollWidth} > ${window.innerWidth}`] : [];
  return ow.concat(out).slice(0, 12);
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(B + '/signin'); await p.fill('input[type=email]', 'finance@acmestudio.example'); await p.fill('input[type=password]', vars.ownerPassword);
  await p.click('button[type=submit]'); await p.waitForURL('**/dashboard', { timeout: 30000 }); await p.waitForSelector('text=Latest decisions');
  console.log('signed in via form; cookie:', (await ctx.cookies()).map((c) => `${c.name} httpOnly=${c.httpOnly} secure=${c.secure}`).join(','));
  const pages = [['/', 'h1'], ['/signin', 'h1'], ['/dashboard', 'text=Latest decisions'], ['/contractors', 'text=Ada Okafor'], ['/approvals', 'text=URGENT'], ['/activity', 'summary'],
                 ['/treasury', 'text=Moves'], ['/sdk', 'h1'], ['/c/' + vars.adaToken, 'text=Your requests'], ['/contractor', 'h1']];
  for (const [w, h] of [[1440, 900], [1024, 800], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const [path, sel] of pages) {
      await p.goto(B + path, { waitUntil: 'commit' }); await p.waitForSelector(sel, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1200);
      if (path === '/activity') await p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      const issues = await p.evaluate(overlapJS);
      const name = `audit/${w}${path.replace(/\//g, '_') || '_home'}.png`.replace('_c_' + vars.adaToken, '_portal');
      await p.screenshot({ path: name, fullPage: true });
      if (issues.length) console.log(`[${w}] ${path.slice(0, 14)}: ${issues.length} issue(s)\n   ` + issues.join('\n   '));
    }
  }
  await b.close();
})();
