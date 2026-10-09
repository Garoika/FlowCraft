import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('📦 Starting Linux x64 Standalone Build...');

// 1. Compile TypeScript
console.log('1️⃣ Compiling TypeScript...');
execSync('npm run build', { stdio: 'inherit' });

// 2. Bundle with esbuild
console.log('2️⃣ Bundling with esbuild into single CommonJS file...');
execSync('npx esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/bundle.cjs', { stdio: 'inherit' });

// 3. Setup release directories
console.log('3️⃣ Preparing release directory...');
const releaseDir = path.resolve('release/FlowCraft-v1.0.0-linux-x64');
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// 4. Compile ELF binary via pkg
const targetBinary = path.join(releaseDir, 'FlowCraft');
console.log('4️⃣ Compiling standalone Linux ELF binary via pkg...');
execSync(`npx pkg dist/bundle.cjs --target node22-linux-x64 --public --output "${targetBinary}"`, { stdio: 'inherit' });

// 5. Copy public directory
console.log('5️⃣ Copying public web assets...');
const targetPublic = path.join(releaseDir, 'public');
fs.cpSync('public', targetPublic, { recursive: true });

// 6. Create Linux readme
const readmeContent = `# ⚡ FlowCraft v1.0.0 (Linux x64 Standalone)

## Как запустить:
1. Сделайте бинарник исполняемым:
   chmod +x ./FlowCraft
2. Запустите:
   ./FlowCraft
3. Автоматически откроется веб-холст по адресу: http://localhost:3344

## Использование с ИИ-агентами (MCP):
В конфиге Claude Desktop / Cursor / Antigravity добавьте:
\`\`\`json
{
  "mcpServers": {
    "flowcraft": {
      "command": "/абсолютный/путь/к/FlowCraft"
    }
  }
}
\`\`\`
`;
fs.writeFileSync(path.join(releaseDir, 'README.txt'), readmeContent, 'utf-8');

// 7. Archive into tar.gz
console.log('6️⃣ Creating tar.gz archive...');
const tarPath = path.resolve('release/FlowCraft-v1.0.0-linux-x64.tar.gz');
if (fs.existsSync(tarPath)) {
  fs.unlinkSync(tarPath);
}

try {
  // Use tar command (built-in Windows 10+ and Linux)
  execSync(`tar -czf "${tarPath}" -C release FlowCraft-v1.0.0-linux-x64`, { stdio: 'inherit' });
  console.log('📦 tar.gz archive successfully created: ' + tarPath);
} catch (err) {
  console.log('Tar failed, creating zip fallback...');
  const zipPath = path.resolve('release/FlowCraft-v1.0.0-linux-x64.zip');
  execSync(`powershell Compress-Archive -Path "${releaseDir}/*" -DestinationPath "${zipPath}" -Force`, { stdio: 'inherit' });
}

console.log('\n🎉 Linux Standalone Build Successfully Created:');
console.log('📁 Directory: ' + releaseDir);
console.log('📦 Archive:   ' + tarPath);
