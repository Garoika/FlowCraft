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

// 7.5 Patch PE Subsystem from CUI (3) to GUI (2) to eliminate console window
console.log('7️⃣.5️⃣ Patching PE Subsystem to GUI (eliminating console window)...');
const exeBuf = fs.readFileSync(targetExe);
const peOffset = exeBuf.readUInt32LE(0x3C);
const subsystemOffset = peOffset + 24 + 68; // Optional Header PE32+ Subsystem offset
exeBuf.writeUInt16LE(2, subsystemOffset);
fs.writeFileSync(targetExe, exeBuf);

// 8. Compile and copy native Windows System Tray companion
console.log('8️⃣ Compiling native Windows System Tray companion...');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const traySrc = path.resolve('src/tray/FlowCraftTray.cs');
const targetTray = path.join(releaseDir, 'FlowCraftTray.exe');

if (fs.existsSync(cscPath) && fs.existsSync(traySrc)) {
  execSync(`"${cscPath}" /target:winexe /optimize+ /out:"${targetTray}" "${traySrc}"`, { stdio: 'inherit' });
  // Also copy to dist for local testing
  fs.copyFileSync(targetTray, path.resolve('dist/FlowCraftTray.exe'));
  console.log('🔔 FlowCraftTray.exe compiled successfully: ' + targetTray);
}

// 9. Copy public directory
console.log('9️⃣ Copying public web assets...');
const targetPublic = path.join(releaseDir, 'public');
fs.cpSync('public', targetPublic, { recursive: true });

// 10. Create a handy readme
const readmeContent = `# ⚡ FlowCraft v1.0.0 (Windows Standalone)

## Как запустить:
1. Запустите **FlowCraft.exe** двойным кликом.
2. Консольное окно не появляется — приложение работает в фоновом режиме.
3. В правом нижнем углу экрана (в системном трее / стрелочке возле часов) появится значок FlowCraft.
4. Автоматически откроется браузер по адресу: **http://localhost:3344**.

## Управление через трей:
- **Клик левой кнопкой мыши (ЛКМ)** по значку — открыть холст в браузере.
- **Клик правой кнопкой мыши (ПКМ)** по значку:
  - 🎨 Открыть холст
  - 📂 Хаб всех схем
  - ❌ **Закрыть FlowCraft** (завершить работу программы)

## Использование с ИИ-агентами (MCP):
В конфиге Claude Desktop / Cursor / Antigravity добавьте:
\`\`\`json
{
  "mcpServers": {
    "flowcraft": {
      "command": "${targetExe.replace(/\\/g, '\\\\')}"
    }
  }
}
\`\`\`
`;
fs.writeFileSync(path.join(releaseDir, 'README.txt'), readmeContent, 'utf-8');

// 11. Archive into ZIP
console.log('1️⃣1️⃣ Creating ZIP archive...');
const zipPath = path.resolve('release/FlowCraft-v1.0.0-windows-x64.zip');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}
execSync('powershell Compress-Archive -Path "' + releaseDir + '/*" -DestinationPath "' + zipPath + '" -Force', { stdio: 'inherit' });

// 12. Archive into RAR via WinRAR if available
console.log('1️⃣2️⃣ Creating RAR archive...');
const rarPath = path.resolve('release/FlowCraft-v1.0.0-windows-x64.rar');
if (fs.existsSync(rarPath)) {
  fs.unlinkSync(rarPath);
}
const winrarPath = 'C:\\Program Files\\WinRAR\\rar.exe';
if (fs.existsSync(winrarPath)) {
  try {
    execSync(`"${winrarPath}" a -r -m5 "${rarPath}" "${releaseDir}"`, { stdio: 'inherit' });
    console.log('📦 RAR archive successfully created: ' + rarPath);
  } catch (_) {}
}

console.log('\n🎉 Windows Standalone Build Successfully Created:');
console.log('📁 Directory: ' + releaseDir);
console.log('📦 ZIP:       ' + zipPath);
if (fs.existsSync(rarPath)) {
  console.log('📦 RAR:       ' + rarPath);
}
