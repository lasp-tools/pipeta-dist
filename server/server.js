const express = require('express');
const cors = require('cors');
const path = require('path');
const open = require('open');
const fs = require('fs-extra'); // Replaces 'fs' with 'fs-extra'

const app = express();
const PORT = 3002;
const VERSION = "v0.9.50";
const os = require('os'); // Added os module

// Restart Flag Check (Prevents duplicate tabs on reload)
// We use OS Temp dir because local files might be wiped by Robocopy /MIR from M: source
const RESTART_FLAG_FILE = path.join(os.tmpdir(), 'pipeta_restarting.flag');
let shouldOpenBrowser = true;

if (fs.existsSync(RESTART_FLAG_FILE)) {
    console.log("[INIT] Recovering from System Restart. Browser auto-open suppressed.");
    shouldOpenBrowser = false;
    try { fs.removeSync(RESTART_FLAG_FILE); } catch (e) { }
}

const { spawn, execSync } = require('child_process');

// --- RCLONE DETECTION ---
const RCLONE_PATH = path.join(__dirname, '../tools/rclone/rclone.exe');
let rcloneAvailable = false;
let rcloneVersion = null;

try {
    if (fs.existsSync(RCLONE_PATH)) {
        const ver = execSync(`"${RCLONE_PATH}" version`, { timeout: 5000 }).toString();
        const match = ver.match(/rclone (v[\d.]+)/);
        rcloneVersion = match ? match[1] : 'unknown';
        rcloneAvailable = true;
        console.log(`[RCLONE] Detected: ${rcloneVersion} at ${RCLONE_PATH}`);
    } else {
        console.log('[RCLONE] Not found. Native copy will be used.');
    }
} catch (e) {
    console.log('[RCLONE] Detection failed:', e.message);
}

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Serve Static UI Files
const uiPath = path.join(__dirname, '../ui');
app.use(express.static(uiPath));

// --- API ENDPOINTS ---

app.get('/api/version', (req, res) => {
    res.json({
        version: VERSION,
        rclone: { available: rcloneAvailable, version: rcloneVersion }
    });
});

app.get('/api/system/info', (req, res) => {
    try {
        res.json({
            username: os.userInfo().username,
            hostname: os.hostname(),
            platform: os.platform()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, '../pipeline_config.json');
        if (fs.existsSync(configPath)) {
            res.json(JSON.parse(fs.readFileSync(configPath, 'utf8')));
        } else {
            res.status(404).json({ error: "Config not found" });
        }
    } catch (err) {
        console.error("Config Error:", err);
        res.status(500).json({ error: "Config Error" });
    }
});

app.get('/api/fs/list', (req, res) => {
    let requestedPath = req.query.path;

    try {
        let targetPath = null;

        if (requestedPath) {
            let safeP = decodeURIComponent(requestedPath);
            if (!fs.existsSync(safeP)) {
                try { fs.mkdirSync(safeP, { recursive: true }); } catch(e){}
            }
            if (fs.existsSync(safeP)) {
                targetPath = safeP;
            }
        }

        if (!targetPath) {
            let configPath = path.join(__dirname, '../pipeline_config.json');
            let config = null;
            if (fs.existsSync(configPath)) {
                try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}
            }

            const candidates = [];
            if (config?.paths?.root_work) candidates.push(config.paths.root_work);
            candidates.push("Z:/");

            for (let p of candidates) {
                if (!p) continue;
                let safeP = decodeURIComponent(p);
                if (fs.existsSync(safeP)) {
                    targetPath = safeP;
                    break;
                }
            }
        }

        if (!targetPath) {
            return res.json({ path: requestedPath || 'Z:/', items: [] });
        }

        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        const result = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(targetPath, item.name).replace(/\\/g, '/')
        }));

        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        res.json({
            path: targetPath,
            items: result
        });

    } catch (error) {
        console.error("FS List Error:", error);
        res.status(500).json({ error: "Unable to read directory", details: error.message });
    }
});

// --- I/O OPERATIONS ---

app.post('/api/fs/open', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        await open(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/mkdir', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        await fs.ensureDir(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/rename', async (req, res) => {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: "Missing paths" });
    try {
        await fs.rename(oldPath, newPath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/copy', async (req, res) => {
    const { src, dest } = req.body;
    if (!src || !dest) return res.status(400).json({ error: "Missing paths" });
    try {
        await fs.copy(src, dest);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/delete', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        await fs.remove(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/deleteFile', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        await fs.remove(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/fs/readFile', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/writeFile', async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content || '', 'utf-8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FOLDER BROWSER DIALOG ---
app.post('/api/system/pickFolder', async (req, res) => {
    let initialPath = req.body?.initialPath || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets';
    initialPath = initialPath.replace(/\//g, '\\');
    const { execFile } = require('child_process');
    
    const psScript = 'Add-Type -AssemblyName System.Windows.Forms\n' +
        '$f = New-Object System.Windows.Forms.FolderBrowserDialog\n' +
        '$f.Description = "Seleccionar carpeta de exportacion de Presets"\n' +
        'if (Test-Path "' + initialPath.replace(/"/g, '`"') + '") {\n' +
        '    $f.SelectedPath = "' + initialPath.replace(/"/g, '`"') + '"\n' +
        '}\n' +
        '$f.ShowNewFolderButton = $true\n' +
        '$form = New-Object System.Windows.Forms.Form\n' +
        '$form.TopMost = $true\n' +
        '$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen\n' +
        '$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized\n' +
        '$form.Show()\n' +
        '$form.BringToFront()\n' +
        '$res = $f.ShowDialog($form)\n' +
        '$form.Dispose()\n' +
        'if ($res -eq [System.Windows.Forms.DialogResult]::OK) {\n' +
        '    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n' +
        '    Write-Output $f.SelectedPath\n' +
        '}\n';

    const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', b64], { timeout: 60000 }, (err, stdout) => {
        if (err && err.killed) {
            return res.json({ canceled: true });
        }
        const selected = stdout ? stdout.trim() : '';
        if (selected) {
            return res.json({ success: true, path: selected });
        }
        res.json({ canceled: true });
    });
});

// --- DISK USAGE ---
app.get('/api/system/diskUsage', async (req, res) => {
    const drives = (req.query.drives || 'C').split(',').map(d => d.trim().toUpperCase().replace(':', ''));
    try {
        const { execSync } = require('child_process');
        const results = {};
        for (const letter of drives) {
            try {
                const cmd = `powershell -NoProfile -Command "(Get-PSDrive -Name '${letter}' -PSProvider FileSystem | Select-Object Used,Free | ConvertTo-Json)"`;
                const raw = execSync(cmd, { timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
                const info = JSON.parse(raw);
                const used = info.Used || 0;
                const free = info.Free || 0;
                const total = used + free;
                results[letter] = {
                    total,
                    used,
                    free,
                    percent: total > 0 ? Math.round((used / total) * 100) : 0
                };
            } catch (e) {
                results[letter] = { total: 0, used: 0, free: 0, percent: 0, error: 'Drive not found' };
            }
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DIRECTORY SIZE ---
app.get('/api/fs/dirSize', async (req, res) => {
    const dirPath = req.query.path;
    if (!dirPath) return res.status(400).json({ error: 'Missing path' });

    try {
        const { execSync } = require('child_process');
        const cmd = `powershell -NoProfile -Command "(Get-ChildItem -Path '${dirPath.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`;
        const raw = execSync(cmd, { timeout: 30000 }).toString().trim();
        const size = parseInt(raw) || 0;
        res.json({ path: dirPath, size });
    } catch (err) {
        res.json({ path: dirPath, size: 0, error: err.message });
    }
});

// --- RCLONE INTEGRATION ---

// Status check
app.get('/api/rclone/status', (req, res) => {
    res.json({
        available: rcloneAvailable,
        version: rcloneVersion,
        path: RCLONE_PATH
    });
});

async function replicateEmptyDirectories(srcDir, destDir) {
    await fs.ensureDir(destDir);
    try {
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const srcSub = path.join(srcDir, entry.name);
                const destSub = path.join(destDir, entry.name);
                await replicateEmptyDirectories(srcSub, destSub);
            }
        }
    } catch (e) {
        console.warn(`[MKDIR_ONLY] Error en ${srcDir}:`, e.message);
    }
}

// Batch sync via rclone (or fallback to native)
app.post('/api/rclone/syncBatch', async (req, res) => {
    const { items, engine = 'auto', onlyFolders = false } = req.body; // [{src, dest, isDirectory, onlyFolders}], engine: 'auto' | 'native' | 'rclone'
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Missing items array' });

    const results = [];
    // Determine which engine to use based on settings and availability
    const useRclone = (engine === 'rclone' && rcloneAvailable) || (engine === 'auto' && rcloneAvailable);
    const usedEngine = onlyFolders ? 'mkdir_only' : (useRclone ? 'rclone' : 'native');

    // If forced rclone but not available
    if (!onlyFolders && engine === 'rclone' && !rcloneAvailable) {
        return res.status(503).json({ error: 'Rclone forced but not available', engine: 'none' });
    }

    for (const item of items) {
        try {
            if (onlyFolders || item.onlyFolders) {
                // Replicar la estructura de carpetas completa sin copiar archivos
                if (item.isDirectory) {
                    await replicateEmptyDirectories(item.src, item.dest);
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                }
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'mkdir_only' });
                continue;
            }

            if (useRclone) {
                // Use rclone with cloud virtual drive compatibility flags
                try {
                    await new Promise((resolve, reject) => {
                        let args;
                        if (item.isDirectory) {
                            // rclone copy src/ dest/ for directories
                            args = ['copy', item.src, item.dest, '--create-empty-src-dirs', '--ignore-size', '--inplace', '--no-check-dest'];
                        } else {
                            // For single files: rclone copyto src dest
                            args = ['copyto', item.src, item.dest, '--ignore-size', '--inplace', '--no-check-dest'];
                        }

                        console.log(`[RCLONE] ${args.join(' ')}`);
                        const proc = spawn(RCLONE_PATH, args, { windowsHide: true });

                        let stderr = '';
                        proc.stderr.on('data', d => stderr += d.toString());
                        proc.on('close', code => {
                            if (code === 0) resolve();
                            else reject(new Error(`rclone exit ${code}: ${stderr}`));
                        });
                        proc.on('error', reject);
                    });
                    results.push({ src: item.src, dest: item.dest, success: true, engine: 'rclone' });
                } catch (rErr) {
                    console.warn(`[RCLONE] Fallback nativo activado tras aviso: ${rErr.message}`);
                    if (item.isDirectory) {
                        await fs.ensureDir(item.dest);
                        await fs.copy(item.src, item.dest, { overwrite: true });
                    } else {
                        await fs.ensureDir(path.dirname(item.dest));
                        await fs.copy(item.src, item.dest, { overwrite: true });
                    }
                    results.push({ src: item.src, dest: item.dest, success: true, engine: 'native_fallback' });
                }
            } else {
                // Use native fs.copy
                if (item.isDirectory) {
                    await fs.ensureDir(item.dest);
                    await fs.copy(item.src, item.dest, { overwrite: true });
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                    await fs.copy(item.src, item.dest, { overwrite: true });
                }
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'native' });
            }
        } catch (err) {
            console.error(`[SYNC] Error: ${err.message}`);
            results.push({ src: item.src, dest: item.dest, success: false, error: err.message, engine: usedEngine });
        }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    res.json({
        total: items.length,
        succeeded,
        failed,
        engine: usedEngine,
        results
    });
});

// --- MIRROR REPAIR BATCH ---
app.post('/api/mirror/repairBatch', async (req, res) => {
    const { items, mode = 'both', mediaSubfolders, workSubfolders, omitControl = true } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Missing items array' });

    let repairedCount = 0;
    const targetMediaSubfolders = (Array.isArray(mediaSubfolders) && mediaSubfolders.length > 0)
        ? mediaSubfolders
        : ['IA/enc', 'IA/export', 'IA/ref', 'nuke/exportIA', 'nuke/fullres', 'nuke/prerender', 'in'];

    const targetWorkSubfolders = (Array.isArray(workSubfolders) && workSubfolders.length > 0)
        ? workSubfolders
        : ['compo'];

    try {
        for (const item of items) {
            const shouldFixMedia = (mode === 'media' || mode === 'both') && (item.status === 'missing-media' || (item.missingMediaFolders && item.missingMediaFolders.length > 0));
            const shouldFixWork = (mode === 'work' || mode === 'both') && (item.status === 'missing-work' || (item.missingWorkFolders && item.missingWorkFolders.length > 0));

            if (shouldFixMedia && item.mediaPath) {
                // Ensure media shot base dir
                await fs.ensureDir(item.mediaPath);
                // Create missing standard subfolders
                for (const sub of targetMediaSubfolders) {
                    await fs.ensureDir(path.join(item.mediaPath, sub));
                }
                if (!omitControl) {
                    const ctrlFile = path.join(item.mediaPath, 'vfx_control.json');
                    if (!await fs.pathExists(ctrlFile)) {
                        await fs.writeJson(ctrlFile, {
                            node_id: item.shot,
                            type: 'shot',
                            preset_id: 'pipeline_test',
                            created_by: 'MirrorAuditor',
                            created_at: new Date().toISOString()
                        }, { spaces: 2 });
                    }
                }
                repairedCount++;
            }

            if (shouldFixWork && item.workPath) {
                // Ensure work shot base dir
                await fs.ensureDir(item.workPath);
                // Create missing standard subfolders
                for (const sub of targetWorkSubfolders) {
                    await fs.ensureDir(path.join(item.workPath, sub));
                }
                if (!omitControl) {
                    const ctrlFile = path.join(item.workPath, 'vfx_control.json');
                    if (!await fs.pathExists(ctrlFile)) {
                        await fs.writeJson(ctrlFile, {
                            node_id: item.shot,
                            type: 'shot',
                            preset_id: 'pipeline_test',
                            created_by: 'MirrorAuditor',
                            created_at: new Date().toISOString()
                        }, { spaces: 2 });
                    }
                }
                repairedCount++;
            }
        }

        res.json({ success: true, repairedCount });
    } catch (err) {
        console.error("[MIRROR] Repair error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- FAST FILE AUDIT SCAN (MIRROR & RENDERS) ---
app.post('/api/audit/scan', async (req, res) => {
    const { auditType, roots, scope = 'all', targetEpisodes = [], config = {} } = req.body;
    if (!roots || !roots.work || !roots.media) {
        return res.status(400).json({ error: 'Missing roots configuration' });
    }

    const normWork = roots.work.replace(/\\/g, '/').replace(/\/+$/, '');
    const normMedia = roots.media.replace(/\\/g, '/').replace(/\/+$/, '');
    const workEpRoot = normWork + '/episodios';

    function extractVersion(str) {
        const match = str.match(/_?v(\d{2,4})/i);
        return match ? { str: 'v' + match[1], num: parseInt(match[1], 10) } : null;
    }

    try {
        if (auditType === 'mirror') {
            const expectedMediaFolders = config.expectedMedia || [];
            const expectedWorkFolders = config.expectedWork || [];

            // 1. Scan Work
            const workShotsMap = new Map();
            if (await fs.pathExists(workEpRoot)) {
                const epItems = await fs.readdir(workEpRoot);
                for (const ep of epItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(workEpRoot, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch(e) { continue; }

                    const seqRoot = path.join(epPath, 'secuencias');
                    if (!await fs.pathExists(seqRoot)) continue;
                    const seqItems = await fs.readdir(seqRoot);

                    for (const seq of seqItems) {
                        const seqPath = path.join(seqRoot, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch(e) { continue; }

                        const shotsRoot = path.join(seqPath, 'shots');
                        if (!await fs.pathExists(shotsRoot)) continue;
                        const shotItems = await fs.readdir(shotsRoot);

                        for (const shot of shotItems) {
                            const shotPath = path.join(shotsRoot, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch(e) { continue; }

                            const key = `${ep}/${seq}/${shot}`.toLowerCase();
                            workShotsMap.set(key, { ep, seq, shot, path: shotPath.replace(/\\/g, '/') });
                        }
                    }
                }
            }

            // 2. Scan Media
            const mediaShotsMap = new Map();
            if (await fs.pathExists(normMedia)) {
                const mediaEpItems = await fs.readdir(normMedia);
                for (const ep of mediaEpItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(normMedia, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch(e) { continue; }

                    const seqItems = await fs.readdir(epPath);
                    for (const seq of seqItems) {
                        const seqPath = path.join(epPath, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch(e) { continue; }

                        const shotItems = await fs.readdir(seqPath);
                        for (const shot of shotItems) {
                            const shotPath = path.join(seqPath, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch(e) { continue; }

                            const key = `${ep}/${seq}/${shot}`.toLowerCase();
                            mediaShotsMap.set(key, { ep, seq, shot, path: shotPath.replace(/\\/g, '/') });
                        }
                    }
                }
            }

            // 3. Cross Compare
            const allKeys = Array.from(new Set([...workShotsMap.keys(), ...mediaShotsMap.keys()]));
            const results = [];

            for (const key of allKeys) {
                const inWork = workShotsMap.has(key);
                const inMedia = mediaShotsMap.has(key);
                const wData = workShotsMap.get(key);
                const mData = mediaShotsMap.get(key);

                const ep = wData?.ep || mData?.ep;
                const seq = wData?.seq || mData?.seq;
                const shot = wData?.shot || mData?.shot;

                const expectedWorkPath = `${normWork}/episodios/${ep}/secuencias/${seq}/shots/${shot}`;
                const expectedMediaPath = `${normMedia}/${ep}/${seq}/${shot}`;

                const record = {
                    key,
                    ep,
                    seq,
                    shot,
                    workPath: inWork ? wData.path : expectedWorkPath,
                    mediaPath: inMedia ? mData.path : expectedMediaPath,
                    existsInWork: inWork,
                    existsInMedia: inMedia,
                    missingMediaFolders: [],
                    missingWorkFolders: [],
                    status: 'ok',
                    selected: false
                };

                if (!inMedia) {
                    record.status = 'missing-media';
                    record.missingMediaFolders = expectedMediaFolders;
                } else if (!inWork) {
                    record.status = 'missing-work';
                    record.missingWorkFolders = expectedWorkFolders;
                } else {
                    let mSubNames = [];
                    let wSubNames = [];
                    try {
                        const mFiles = await fs.readdir(record.mediaPath);
                        for (const f of mFiles) {
                            if ((await fs.stat(path.join(record.mediaPath, f))).isDirectory()) mSubNames.push(f.toLowerCase());
                        }
                    } catch (e) { }
                    try {
                        const wFiles = await fs.readdir(record.workPath);
                        for (const f of wFiles) {
                            if ((await fs.stat(path.join(record.workPath, f))).isDirectory()) wSubNames.push(f.toLowerCase());
                        }
                    } catch (e) { }

                    const missingM = expectedMediaFolders.filter(f => !mSubNames.includes(f.toLowerCase()) && !mSubNames.includes(f.split('/')[0].toLowerCase()));
                    const missingW = expectedWorkFolders.filter(f => !wSubNames.includes(f.toLowerCase()));

                    record.missingMediaFolders = missingM;
                    record.missingWorkFolders = missingW;

                    if (missingM.length > 0 || missingW.length > 0) {
                        record.status = 'incomplete';
                    }
                }
                results.push(record);
            }

            results.sort((a, b) => a.key.localeCompare(b.key));
            return res.json({ success: true, results });

        } else {
            // Render / Scenes Audit
            const targetProc = config.process || 'compo';
            const allowedExts = config.allowedExtensions || ['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d'];
            const processes = config.processes || ['compo'];
            const procExtMap = config.procExtMap || { 'compo': '.nk' };

            const results = [];
            if (await fs.pathExists(workEpRoot)) {
                const epItems = await fs.readdir(workEpRoot);
                for (const ep of epItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(workEpRoot, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch(e) { continue; }

                    const seqRoot = path.join(epPath, 'secuencias');
                    if (!await fs.pathExists(seqRoot)) continue;
                    const seqItems = await fs.readdir(seqRoot);

                    for (const seq of seqItems) {
                        const seqPath = path.join(seqRoot, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch(e) { continue; }

                        const shotsRoot = path.join(seqPath, 'shots');
                        if (!await fs.pathExists(shotsRoot)) continue;
                        const shotItems = await fs.readdir(shotsRoot);

                        for (const shot of shotItems) {
                            const shotPath = path.join(shotsRoot, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch(e) { continue; }

                            const shotWorkPath = shotPath.replace(/\\/g, '/');
                            const shotMediaPath = `${normMedia}/${ep}/${seq}/${shot}`;
                            const procList = (targetProc === 'all') ? processes : [targetProc];

                            for (const procName of procList) {
                                const procWorkPath = `${shotWorkPath}/${procName}`;
                                let rawFiles = [];
                                try {
                                    if (await fs.pathExists(procWorkPath)) {
                                        rawFiles = await fs.readdir(procWorkPath);
                                    }
                                } catch (e) { }

                                // Filter script scene files
                                const scriptFiles = [];
                                for (const rf of rawFiles) {
                                    const rfLower = rf.toLowerCase();
                                    if (rfLower.endsWith('.txt') || rfLower.endsWith('.json') || rfLower.endsWith('.bak') || rfLower.endsWith('.tmp') || rfLower.endsWith('.log') || rfLower.endsWith('~')) continue;
                                    const ext = '.' + rfLower.split('.').pop();
                                    if (allowedExts.includes(ext)) {
                                        scriptFiles.push(rf);
                                    }
                                }

                                const scriptVersions = [];
                                const badScriptFiles = [];
                                for (const sf of scriptFiles) {
                                    const vInfo = extractVersion(sf);
                                    const sfLower = sf.toLowerCase();
                                    const hasShot = sfLower.includes(shot.toLowerCase());
                                    if (!hasShot || !vInfo) {
                                        badScriptFiles.push(sf);
                                    }
                                    if (vInfo) {
                                        scriptVersions.push({ name: sf, ...vInfo });
                                    }
                                }
                                scriptVersions.sort((a, b) => b.num - a.num);
                                const latestScript = scriptVersions[0] || null;

                                // Check renders in Media
                                const foundRenders = [];
                                if (await fs.pathExists(shotMediaPath)) {
                                    try {
                                        const mediaSubs = await fs.readdir(shotMediaPath);
                                        for (const mSub of mediaSubs) {
                                            const mSubPath = path.join(shotMediaPath, mSub);
                                            try {
                                                if (!(await fs.stat(mSubPath)).isDirectory()) continue;
                                            } catch(e) { continue; }
                                            const subNameLower = mSub.toLowerCase();

                                            const deepItems = await fs.readdir(mSubPath);
                                            for (const deepItem of deepItems) {
                                                const deepPath = path.join(mSubPath, deepItem);
                                                let deepStat;
                                                try {
                                                    deepStat = await fs.stat(deepPath);
                                                } catch(e) { continue; }
                                                const deepLower = deepItem.toLowerCase();
                                                const vFolder = extractVersion(deepItem);

                                                if (deepStat.isDirectory() && vFolder) {
                                                    const frameFiles = (await fs.readdir(deepPath)).filter(f => !f.startsWith('.'));
                                                    const isMov = subNameLower.includes('mov') || deepLower.includes('mov') || deepLower.includes('compres') || deepLower.includes('mp4');
                                                    const isTcl = subNameLower.includes('prerender') || deepLower.includes('prerender');
                                                    const rType = isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres');

                                                    const badFiles = [];
                                                    if (!isTcl && frameFiles.length > 0) {
                                                        for (const ff of frameFiles) {
                                                            const ffLower = ff.toLowerCase();
                                                            const hasShot = ffLower.includes(shot.toLowerCase());
                                                            const hasVer = ffLower.includes(vFolder.str.toLowerCase());
                                                            if (!hasShot || !hasVer) badFiles.push(ff);
                                                        }
                                                    }

                                                    foundRenders.push({
                                                        type: rType,
                                                        folderName: deepItem,
                                                        versionStr: vFolder.str,
                                                        versionNum: vFolder.num,
                                                        path: deepPath.replace(/\\/g, '/'),
                                                        frameCount: frameFiles.length,
                                                        hasBadNaming: badFiles.length > 0,
                                                        badFiles
                                                    });
                                                } else if (!deepStat.isDirectory()) {
                                                    const vFile = extractVersion(deepItem);
                                                    if (vFile) {
                                                        const isMov = deepLower.endsWith('.mov') || deepLower.endsWith('.mp4');
                                                        const isTcl = subNameLower.includes('prerender') || deepLower.includes('prerender');
                                                        const badFiles = [];
                                                        if (!isTcl) {
                                                            const hasShot = deepLower.includes(shot.toLowerCase());
                                                            const hasVer = deepLower.includes(vFile.str.toLowerCase());
                                                            if (!hasShot || !hasVer) badFiles.push(deepItem);
                                                        }
                                                        foundRenders.push({
                                                            type: isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres'),
                                                            folderName: mSub,
                                                            versionStr: vFile.str,
                                                            versionNum: vFile.num,
                                                            path: deepPath.replace(/\\/g, '/'),
                                                            frameCount: 1,
                                                            hasBadNaming: badFiles.length > 0,
                                                            badFiles
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) { }
                                }

                                foundRenders.sort((a, b) => b.versionNum - a.versionNum);

                                const shotRecord = {
                                    key: `${ep}/${seq}/${shot}/${procName}`,
                                    ep,
                                    seq,
                                    shot,
                                    process: procName,
                                    expectedExt: procExtMap[procName] || '.nk',
                                    scriptCount: scriptFiles.length,
                                    scriptFiles: scriptFiles,
                                    badScriptFiles: badScriptFiles,
                                    latestScriptVer: latestScript ? latestScript.str : null,
                                    latestScriptNum: latestScript ? latestScript.num : null,
                                    latestScriptName: latestScript ? latestScript.name : null,
                                    scriptPath: procWorkPath,
                                    renders: foundRenders,
                                    badFiles: [],
                                    sceneStatus: 'no-script',
                                    renderStatus: 'no-script'
                                };

                                // 1. Scene Status
                                if (scriptFiles.length === 0) {
                                    shotRecord.sceneStatus = 'no-script';
                                } else if (badScriptFiles.length > 0) {
                                    shotRecord.sceneStatus = 'bad-naming';
                                } else {
                                    shotRecord.sceneStatus = 'has-scene';
                                }

                                // 2. Render Status
                                const targetRenders = foundRenders.filter(r => {
                                    if (config.onlyFullRes && r.type !== 'fullres') return false;
                                    return true;
                                });

                                const matchingRender = targetRenders.find(r => latestScript && r.versionNum === latestScript.num);
                                const highestRender = targetRenders[0] || null;

                                if (!latestScript) {
                                    if (highestRender) {
                                        shotRecord.renderStatus = 'orphan-render';
                                    } else {
                                        shotRecord.renderStatus = 'no-script';
                                    }
                                } else {
                                    if (highestRender && highestRender.versionNum > latestScript.num) {
                                        shotRecord.renderStatus = 'orphan-render';
                                    } else if (matchingRender) {
                                        if (matchingRender.hasBadNaming) {
                                            shotRecord.renderStatus = 'bad-naming';
                                            shotRecord.badFiles = matchingRender.badFiles;
                                        } else {
                                            shotRecord.renderStatus = 'up-to-date';
                                        }
                                    } else if (highestRender && highestRender.versionNum < latestScript.num) {
                                        if (highestRender.hasBadNaming) {
                                            shotRecord.renderStatus = 'bad-naming';
                                            shotRecord.badFiles = highestRender.badFiles;
                                        } else {
                                            shotRecord.renderStatus = 'outdated';
                                        }
                                    } else {
                                        shotRecord.renderStatus = 'missing-render';
                                    }
                                }

                                results.push(shotRecord);
                            }
                        }
                    }
                }
            }

            results.sort((a, b) => a.key.localeCompare(b.key));
            return res.json({ success: true, results });
        }
    } catch (err) {
        console.error("[AUDIT] Scan error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// --- APP CONTROL ---

app.post('/api/app/close', (req, res) => {
    console.log("[APP] Closing application via UI request...");
    res.json({ status: 'closing' });
    setTimeout(() => {
        process.exit(0);
    }, 500);
});

app.post('/api/app/restart', (req, res) => {
    console.log("[APP] Restarting application via UI request...");

    // Set Flag in TEMP directory (surviving Robocopy)
    try {
        const flagPath = path.join(os.tmpdir(), 'pipeta_restarting.flag');
        fs.writeFileSync(flagPath, 'true');
    } catch (e) { console.error("Failed to write restart flag:", e); }

    res.json({ status: 'restarting' });

    let batPath = path.join(__dirname, '../Launch_Pipeta.bat');
    if (!fs.existsSync(batPath)) {
        batPath = 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\Launch_Pipeta.bat';
    }
    if (!fs.existsSync(batPath)) {
        batPath = 'C:\\TOOLS\\APPS\\Pipeta\\Launch_Pipeta.bat';
    }

    const subprocess = spawn('cmd.exe', ['/c', 'start', '""', `"${batPath}"`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: true
    });

    subprocess.unref();

    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

// --- IA PIPELINE ENDPOINTS ---

app.get('/api/ia/config', (req, res) => {
    res.json({
        motors: [
            { id: "SD2", label: "Seedance v2.0" },
            { id: "SD25", label: "Seedance v2.5" },
            { id: "VEO3", label: "Google Veo v3.0" },
            { id: "VO31", label: "Google Veo v3.1" },
            { id: "GOMN", label: "Gemini / Veo Omni Flash" },
            { id: "NBN2", label: "Nano Banana 2" },
            { id: "NB2P", label: "Nano Banana 2 Pro" }
        ],
        resolutions: ["FHD", "UHD", "HD", "SQ1K", "UW2K", "1080p16", "4k169", "1344x768", "1536x864", "2206x946"],
        framings: ["FLL", "CRP"],
        tags: {
            levelA: ["", "ref", "ref1050", "f1001", "start1001", "end1100"],
            levelB: ["", "inp", "ups", "mask", "clean", "elem"],
            levelC: ["", "t2i", "i2i", "t2v", "i2v", "v2v", "m2v"]
        }
    });
});

app.get('/api/ia/resolve-shot', (req, res) => {
    const shotId = (req.query.shotId || '').trim();
    const mediaRootParam = (req.query.mediaRoot || req.query.workRoot || '').trim();
    if (!shotId) return res.status(400).json({ error: "shotId parameter required" });

    const parts = shotId.split('_');
    let projCode = parts[0] || 'PROJ';
    let ep = parts[1] || 'B01';
    let seq = parts[2] || '001';
    let shotNum = parts[3] || '0100';

    let rootPath = mediaRootParam || "Z:/INTERNO/MEDIA/";
    if (!mediaRootParam) {
        try {
            const configPath = path.join(__dirname, '../pipeline_config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.paths && config.paths.root_media) {
                    rootPath = config.paths.root_media;
                } else if (config.paths && config.paths.root_work) {
                    rootPath = config.paths.root_work;
                }
            }
        } catch(e) {}
    }

    let candidate1 = path.normalize(path.join(rootPath, 'episodios', ep, 'secuencias', seq, 'shots', shotId, 'IA')).replace(/\\/g, '/');
    let candidate2 = path.normalize(path.join(rootPath, ep, seq, shotId, 'IA')).replace(/\\/g, '/');
    let candidate3 = path.normalize(path.join(rootPath, 'episodios', ep, 'secuencias', seq, 'shots', shotId)).replace(/\\/g, '/');
    let candidate4 = path.normalize(path.join(rootPath, ep, seq, shotId)).replace(/\\/g, '/');

    let resolvedIaPath = candidate1;
    if (fs.existsSync(candidate1)) resolvedIaPath = candidate1;
    else if (fs.existsSync(candidate2)) resolvedIaPath = candidate2;
    else if (fs.existsSync(candidate3)) resolvedIaPath = candidate1;
    else if (fs.existsSync(candidate4)) resolvedIaPath = candidate2;
    else if (fs.existsSync(path.join(rootPath, ep))) resolvedIaPath = candidate2;
    else resolvedIaPath = candidate1;

    let nextVersion = 'v001';
    let maxVer = 0;
    if (fs.existsSync(resolvedIaPath)) {
        try {
            const files = fs.readdirSync(resolvedIaPath);
            files.forEach(f => {
                const match = f.match(/_v(\d{3,4})\./i);
                if (match) {
                    const verNum = parseInt(match[1], 10);
                    if (verNum > maxVer) maxVer = verNum;
                }
            });
            nextVersion = 'v' + String(maxVer + 1).padStart(3, '0');
        } catch(e){}
    }

    res.json({
        shotId,
        projCode,
        ep,
        seq,
        shotNum,
        iaPath: resolvedIaPath,
        exists: fs.existsSync(resolvedIaPath),
        suggestedVersion: nextVersion
    });
});

app.post('/api/ia/ingest', (req, res) => {
    try {
        const { targetFolder, filename, sourcePath, fileData } = req.body;
        if (!targetFolder || !filename) {
            return res.status(400).json({ error: "targetFolder and filename are required" });
        }

        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
        }

        const destFilePath = path.join(targetFolder, filename);

        if (sourcePath && fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destFilePath);
        } else if (fileData) {
            const buffer = Buffer.from(fileData, 'base64');
            fs.writeFileSync(destFilePath, buffer);
        } else {
            fs.writeFileSync(destFilePath, '');
        }

        console.log(`[IA INGEST] Saved: ${destFilePath}`);
        res.json({
            success: true,
            destination: destFilePath,
            filename: filename
        });
    } catch (err) {
        console.error("Ingest Error:", err);
        res.status(500).json({ error: "Failed to ingest file", details: err.message });
    }
});

app.get('/api/ia/open-folder', (req, res) => {
    const folderPath = (req.query.folderPath || '').trim();
    if (!folderPath) return res.status(400).json({ error: "folderPath required" });

    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        const { exec } = require('child_process');
        const normPath = path.normalize(folderPath);
        exec(`explorer "${normPath}"`);
        res.json({ success: true, opened: normPath });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

const CUSTOM_TOKENS_FILE = path.join(__dirname, '../presets/ia_custom_tokens.json');

app.get('/api/ia/custom-tokens', (req, res) => {
    try {
        if (fs.existsSync(CUSTOM_TOKENS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CUSTOM_TOKENS_FILE, 'utf8'));
            return res.json(data);
        }
        res.json({ motors: [], resolutions: [], framings: [], tagsA: [], tagsB: [], tagsC: [] });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ia/save-custom-tokens', (req, res) => {
    try {
        const { motors, resolutions, framings, tagsA, tagsB, tagsC } = req.body;
        let existing = { motors: [], resolutions: [], framings: [], tagsA: [], tagsB: [], tagsC: [] };
        if (fs.existsSync(CUSTOM_TOKENS_FILE)) {
            try { existing = JSON.parse(fs.readFileSync(CUSTOM_TOKENS_FILE, 'utf8')); } catch(err){}
        }

        const mergeArrays = (arr1 = [], arr2 = []) => Array.from(new Set([...arr1, ...arr2])).filter(Boolean);

        const updated = {
            motors: mergeArrays(existing.motors, motors),
            resolutions: mergeArrays(existing.resolutions, resolutions),
            framings: mergeArrays(existing.framings, framings),
            tagsA: mergeArrays(existing.tagsA, tagsA),
            tagsB: mergeArrays(existing.tagsB, tagsB),
            tagsC: mergeArrays(existing.tagsC, tagsC)
        };

        const presetsDir = path.join(__dirname, '../presets');
        if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir, { recursive: true });

        fs.writeFileSync(CUSTOM_TOKENS_FILE, JSON.stringify(updated, null, 2), 'utf8');

        const zPresetsDir = 'Z:/INTERNO/TOOLS/Mati/Propios/Scripts/Pipeta/presets';
        if (fs.existsSync(zPresetsDir)) {
            try { fs.writeFileSync(path.join(zPresetsDir, 'ia_custom_tokens.json'), JSON.stringify(updated, null, 2), 'utf8'); } catch(e){}
        }

        res.json({ success: true, tokens: updated });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// --- CHROME & EDGE DOWNLOAD WATCHER (Autodetección + Redirección a Downloads/IA) ---
let downloadWatcherActive = false;
let watchedDownloads = [];
let lastKnownFiles = new Set();
let activeWatchFolder = '';

const userHome = process.env.USERPROFILE || 'C:\\Users\\' + (process.env.USERNAME || 'Default');
const defaultIaDownloadsFolder = path.join(userHome, 'Downloads', 'IA');
const fallbackChromeDownloadsFolder = path.join(userHome, 'Downloads');

function getBrowserPreferenceFiles() {
    const localAppData = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local');
    const prefFiles = [];
    ['Google/Chrome/User Data', 'Microsoft/Edge/User Data'].forEach(bRel => {
        const bDir = path.join(localAppData, bRel);
        if (fs.existsSync(bDir)) {
            try {
                fs.readdirSync(bDir).forEach(d => {
                    const pFile = path.join(bDir, d, 'Preferences');
                    if (fs.existsSync(pFile)) prefFiles.push(pFile);
                });
            } catch(e){}
        }
    });
    return prefFiles;
}

function autoDetectChromeDownloadFolder() {
    const prefFiles = getBrowserPreferenceFiles();
    for (const pFile of prefFiles) {
        try {
            const content = JSON.parse(fs.readFileSync(pFile, 'utf8'));
            if (content.download && content.download.default_directory) {
                const dir = content.download.default_directory;
                if (fs.existsSync(dir)) return dir;
            }
        } catch(e){}
    }

    if (!fs.existsSync(defaultIaDownloadsFolder)) {
        try { fs.mkdirSync(defaultIaDownloadsFolder, { recursive: true }); } catch(e){}
    }
    return fs.existsSync(defaultIaDownloadsFolder) ? defaultIaDownloadsFolder : fallbackChromeDownloadsFolder;
}

function scanChromeDownloadsFolder() {
    const targetFolders = [defaultIaDownloadsFolder, fallbackChromeDownloadsFolder];
    if (activeWatchFolder && !targetFolders.includes(activeWatchFolder)) {
        targetFolders.push(activeWatchFolder);
    }

    targetFolders.forEach(folder => {
        if (!fs.existsSync(folder)) return;
        try {
            const files = fs.readdirSync(folder);
            files.forEach(fileName => {
                if (fileName.endsWith('.crdownload') || fileName.endsWith('.tmp')) return;
                const ext = path.extname(fileName).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.mp4', '.webp', '.mov'].includes(ext)) {
                    const fullPath = path.join(folder, fileName);
                    if (!lastKnownFiles.has(fullPath)) {
                        lastKnownFiles.add(fullPath);
                        const stats = fs.statSync(fullPath);
                        const fileObj = {
                            name: fileName,
                            path: fullPath,
                            ext: ext,
                            mtime: stats.mtimeMs
                        };
                        watchedDownloads.push(fileObj);
                        console.log(`[DOWNLOAD WATCHER] New download captured from ${folder}: ${fullPath}`);
                    }
                }
            });
        } catch(e) {
            console.error("Download watcher scan error:", e);
        }
    });
}

let watcherInterval = null;

app.get('/api/ia/start-download-watcher', (req, res) => {
    activeWatchFolder = autoDetectChromeDownloadFolder();

    lastKnownFiles.clear();
    [defaultIaDownloadsFolder, fallbackChromeDownloadsFolder, activeWatchFolder].forEach(folder => {
        if (folder && fs.existsSync(folder)) {
            try {
                fs.readdirSync(folder).forEach(f => {
                    lastKnownFiles.add(path.join(folder, f));
                });
            } catch(e){}
        }
    });

    downloadWatcherActive = true;
    if (!watcherInterval) {
        watcherInterval = setInterval(scanChromeDownloadsFolder, 1500);
    }
    res.json({ success: true, active: true, folder: activeWatchFolder });
});

app.get('/api/ia/stop-download-watcher', (req, res) => {
    downloadWatcherActive = false;
    if (watcherInterval) {
        clearInterval(watcherInterval);
        watcherInterval = null;
    }
    res.json({ success: true, active: false });
});

app.get('/api/ia/watcher-poll', (req, res) => {
    const pending = [...watchedDownloads];
    watchedDownloads = [];
    res.json({ active: downloadWatcherActive, files: pending, folder: activeWatchFolder });
});

app.get('/api/ia/open-chrome-settings', (req, res) => {
    try {
        const { exec } = require('child_process');
        exec(`powershell -Command "Start-Process 'chrome.exe' 'chrome://settings/downloads'"`);
        res.json({ success: true, opened: 'chrome://settings/downloads' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/ia/file-preview', (req, res) => {
    const filePath = (req.query.path || '').trim();
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    res.sendFile(path.resolve(filePath));
});

// Fallback logic
app.get('*', (req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
});

// Start Server
app.listen(PORT, async () => {
    console.log(`Pipeta Core running at http://localhost:${PORT}`);
    console.log(`Version: ${VERSION}`);

    const noBrowser = process.argv.includes('--no-browser');
    if (shouldOpenBrowser && !noBrowser) {
        try {
            await open(`http://localhost:${PORT}`);
        } catch (e) {
            console.log("Failed to auto-open browser:", e);
        }
    } else {
        console.log("[INFO] Browser launch skipped (Restart Recovery or --no-browser active).");
    }
});
