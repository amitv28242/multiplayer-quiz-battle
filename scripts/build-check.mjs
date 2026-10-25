import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
if (!html.includes('/.netlify/functions/game')) throw new Error('Frontend is missing the game function endpoint.');
if (!html.includes('QUESTION_BANK')) throw new Error('Question bank is missing.');
console.log('Static frontend sanity check passed. Netlify runtime integration still needs deployment verification.');
