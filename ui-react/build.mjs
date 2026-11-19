import { build } from 'esbuild';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  outfile: 'dist/app.js',
  minify: true,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
  target: ['es2020'],
});
await copyFile('src/index.html', 'dist/index.html');
await cp('src/assets', 'dist/assets', { recursive: true });

const notices = [];
for (const name of ['react', 'react-dom', 'scheduler']) {
  const license = await readFile(`node_modules/${name}/LICENSE`, 'utf8');
  const metadata = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  notices.push(`${name} ${metadata.version}\n\n${license.trim()}`);
}
await writeFile('dist/third-party.txt', notices.join('\n\n') + '\n');
