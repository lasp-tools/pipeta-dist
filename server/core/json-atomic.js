const fs = require('fs-extra');
const path = require('path');

/**
 * Escribe un JSON de forma atómica (archivo temporal + rename) para evitar
 * archivos truncados o corruptos cuando múltiples procesos escriben en paralelo.
 */
function writeJsonAtomicSync(filePath, data, spaces = 2) {
    const dir = path.dirname(filePath);
    fs.ensureDirSync(dir);
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
    const payload = JSON.stringify(data, null, spaces);
    try {
        fs.writeFileSync(tmpPath, payload, 'utf8');
        try {
            fs.renameSync(tmpPath, filePath);
        } catch (renameErr) {
            // Fallback en SMB si rename sobre archivo bloqueado falla momentáneamente
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            fs.writeFileSync(filePath, payload, 'utf8');
        }
    } catch (err) {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
        throw err;
    }
}

module.exports = { writeJsonAtomicSync };
