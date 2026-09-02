import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('📦 Starting Windows Standalone Build...');

// 1. Compile TypeScript
console.log('1️⃣ Compiling TypeScript...');
execSync('npm run build', { stdio: 'inherit' });

// 2. Bundle with esbuild
console.log('2️⃣ Bundling with esbuild into single CommonJS file...');
execSync('npx esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/bundle.cjs', { stdio: 'inherit' });

// 3. Create sea-config.json
console.log('3️⃣ Creating SEA configuration...');
const seaConfig = {
  main: "dist/bundle.cjs",
  output: "dist/sea-prep.blob",
  disableExperimentalSEAWarning: true
};
fs.writeFileSync('sea-config.json', JSON.stringify(seaConfig, null, 2));

// 4. Generate SEA blob
console.log('4️⃣ Generating SEA blob...');
execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit' });

// 5. Setup release directories
console.log('5️⃣ Preparing release directory...');
const releaseDir = path.resolve('release/FlowCraft-v1.0.0-windows-x64');
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// 6. Copy node.exe to target executable
const targetExe = path.join(releaseDir, 'FlowCraft.exe');
console.log('6️⃣ Copying host node executable to ' + targetExe + '...');
fs.copyFileSync(process.execPath, targetExe);

// 7. Inject blob via postject
console.log('7️⃣ Injecting application blob into FlowCraft.exe via postject...');
execSync('npx postject "' + targetExe + '" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', { stdio: 'inherit' });

// 8. Copy public directory
console.log('8️⃣ Copying public web assets...');
const targetPublic = path.join(releaseDir, 'public');
fs.cpSync('public', targetPublic, { recursive: true });

// 9. Create a handy readme
const readmeContent = '# ⚡ FlowCraft v1.0.0 (Windows Standalone)\n\n## Как запустить:\n1. Просто запустите **FlowCraft.exe** двойным кликом.\n2. Автоматически откроется браузер по адресу: **http://localhost:3344**.\n\n## Использование с ИИ-агентами (MCP):\nВ конфиге Claude Desktop / Cursor / Antigravity добавьте:\n`json\n{\n  "mcpServers": {\n    "flowcraft": {\n      "command": "' + targetExe.replace(/\\/g, '\\\\') + '"\n    }\n  }\n}\n`\n';
fs.writeFileSync(path.join(releaseDir, 'README.txt'), readmeContent);

// 10. Archive into ZIP
console.log('🔟 Creating ZIP archive...');
const zipPath = path.resolve('release/FlowCraft-v1.0.0-windows-x64.zip');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

execSync('powershell Compress-Archive -Path "' + releaseDir + '/*" -DestinationPath "' + zipPath + '" -Force', { stdio: 'inherit' });

console.log('\n🎉 Windows Standalone Build Successfully Created:');
console.log('📁 Directory: ' + releaseDir);
console.log('📦 Archive:   ' + zipPath);
