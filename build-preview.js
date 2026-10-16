/* Builds preview.html: one self-contained page with the real engine, the real UI and four bot players. */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
const html = `<title>Guess the Object</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Mono:wght@400;500&family=Figtree:wght@400;600;700&display=swap">
<style>
${read('style.css')}
</style>
<div class="app">
  <header class="top" id="top"></header>
  <main id="main"></main>
</div>
<div id="toasts" aria-live="polite"></div>
<script>
${read('engine.js')}
</script>
<script>
${read('demo.js')}
</script>
<script>
${read('app.js')}
</script>
`;
fs.writeFileSync(path.join(__dirname, 'preview.html'), html);
console.log('preview.html', Math.round(html.length / 1024) + ' KB');
