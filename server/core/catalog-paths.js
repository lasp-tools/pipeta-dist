const fs = require('fs');
const path = require('path');

/**
 * Normaliza separadores de ruta a slash Unix `/` y quita barras finales redundantes.
 * @param {string} p
 * @returns {string}
 */
function normalizeSlash(p) {
    if (!p || typeof p !== 'string') return '';
    return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Resuelve la ruta equivalente en el servidor SMB (S: o UNC) a partir de una ruta local Z:.
 * @param {string} localPath
 * @param {string} uncRoot
 * @param {(p: string) => boolean} [existsFn]
 * @returns {string}
 */
function resolveSmbCandidate(localPath, uncRoot = '//192.168.206.116/Z', existsFn = fs.existsSync) {
    let clean = (localPath || '').replace(/\\/g, '/');
    if (!clean) return '';
    // Normalizar rutas físicas de vsubs locales (D:/Z/... o C:/STORAGE/Z/...) a raíz lógica Z:/...
    clean = clean.replace(/^(?:D:\/Z|C:\/STORAGE\/Z)(?=\/|$)/i, 'Z:');
    const cleanUnc = (uncRoot || '//192.168.206.116/Z').replace(/\\/g, '/').replace(/\/+$/, '');
    const sCand = clean.replace(/^[a-zA-Z]:/i, 'S:');
    const uncCand = clean.replace(/^[a-zA-Z]:/i, cleanUnc);

    if (existsFn(sCand)) return sCand;
    if (existsFn(uncCand)) return uncCand;
    if (existsFn('S:/INTERNO')) return sCand;
    return uncCand;
}

/**
 * Compara metadatos (tamaño y mtimeMs) entre un archivo local y su contraparte en SMB.
 * @param {{ size: number, mtimeMs: number }} localStat
 * @param {{ size: number, mtimeMs: number }} smbStat
 * @param {number} [toleranceMs=3000]
 * @returns {'identical'|'local_newer'|'smb_newer'|'size_mismatch'}
 */
function classifyFileComparison(localStat, smbStat, toleranceMs = 3000) {
    const mtimeDiff = (localStat.mtimeMs || 0) - (smbStat.mtimeMs || 0);
    if (localStat.size === smbStat.size && Math.abs(mtimeDiff) < toleranceMs) {
        return 'identical';
    }
    if (mtimeDiff > toleranceMs) return 'local_newer';
    if (mtimeDiff < -toleranceMs) return 'smb_newer';
    return 'size_mismatch';
}

/**
 * Genera una ruta con sufijo correlativo `_01`, `_02`, etc. antes de la extensión.
 * @param {string} filePath
 * @param {(p: string) => boolean} [existsFn]
 * @returns {{ newName: string, newPath: string }}
 */
function getNextAvailableSuffixPath(filePath, existsFn = fs.existsSync) {
    const clean = (filePath || '').replace(/\\/g, '/');
    const dir = path.posix.dirname(clean);
    const ext = path.posix.extname(clean);
    const baseName = path.posix.basename(clean, ext);

    const match = baseName.match(/^(.*)_([0-9]{2,})$/);
    let prefix = baseName;
    let num = 1;
    if (match) {
        prefix = match[1];
        num = parseInt(match[2], 10) + 1;
    }

    let candidateName = '';
    let candidatePath = '';
    do {
        const numStr = String(num).padStart(2, '0');
        candidateName = `${prefix}_${numStr}${ext}`;
        candidatePath = dir === '.' ? candidateName : `${dir}/${candidateName}`;
        num++;
    } while (existsFn(candidatePath));

    return { newName: candidateName, newPath: candidatePath };
}

/**
 * Extrae el número de versión más alto (`_v001` .. `_vNNN`) encontrado en una lista de nombres/rutas.
 * @param {string[]} fileNamesOrPaths
 * @returns {number} 0 si no se detectó ninguna versión.
 */
function extractMaxIaVersion(fileNamesOrPaths) {
    if (!Array.isArray(fileNamesOrPaths)) return 0;
    let maxVer = 0;
    for (const entry of fileNamesOrPaths) {
        if (!entry || typeof entry !== 'string') continue;
        const base = entry.replace(/\\/g, '/').split('/').pop() || '';
        const m = base.match(/_v(\d{2,4})(?:[._-]|$)/i);
        if (m) {
            const v = parseInt(m[1], 10);
            if (!Number.isNaN(v) && v > maxVer) maxVer = v;
        }
    }
    return maxVer;
}

module.exports = {
    normalizeSlash,
    resolveSmbCandidate,
    classifyFileComparison,
    getNextAvailableSuffixPath,
    extractMaxIaVersion
};
