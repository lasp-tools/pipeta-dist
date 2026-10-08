const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

/**
 * Módulo de integración Higgsfield AI para Pipeta
 * Maneja credenciales, consulta de jobs (sin costo de créditos),
 * descarga de videos/referencias, generación de ledger (.meta.json)
 * y preservación en estructura canónica de estudio.
 */

// Rutas candidatas para encontrar credenciales de Higgsfield
function getCandidateCredPaths() {
    const candidates = [];
    
    // 1. Home directory actual
    const home = os.homedir();
    if (home) {
        candidates.push({
            cred: path.join(home, '.config', 'higgsfield', 'credentials.json'),
            conf: path.join(home, '.config', 'higgsfield', 'config.json')
        });
    }

    // 2. Ruta fija en máquina dev / usuario principal
    candidates.push({
        cred: 'C:/Users/lasp-mpastorino/.config/higgsfield/credentials.json',
        conf: 'C:/Users/lasp-mpastorino/.config/higgsfield/config.json'
    });

    // 3. Rutas en Z:\ (centralizadas en GITHUB/TOOLS/APPS/credentials/higgsfield)
    candidates.push({
        cred: 'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/credentials/higgsfield/credentials.json',
        conf: 'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/credentials/higgsfield/config.json'
    });
    candidates.push({
        cred: '//192.168.206.116/Z/INTERNO/TOOLS/GITHUB/TOOLS/APPS/credentials/higgsfield/credentials.json',
        conf: '//192.168.206.116/Z/INTERNO/TOOLS/GITHUB/TOOLS/APPS/credentials/higgsfield/config.json'
    });
    candidates.push({
        cred: 'C:/TOOLS/APPS/credentials/higgsfield/credentials.json',
        conf: 'C:/TOOLS/APPS/credentials/higgsfield/config.json'
    });

    // 4. Fallbacks históricos
    candidates.push({
        cred: 'Z:/INTERNO/TOOLS/higgsfield/credentials.json',
        conf: 'Z:/INTERNO/TOOLS/higgsfield/config.json'
    });
    candidates.push({
        cred: '//192.168.206.116/Z/INTERNO/TOOLS/higgsfield/credentials.json',
        conf: '//192.168.206.116/Z/INTERNO/TOOLS/higgsfield/config.json'
    });

    return candidates;
}

/**
 * Obtiene credenciales válidas (access_token y workspace_id)
 */
function getCredentials() {
    // Primero variables de entorno si existen
    if (process.env.HIGGSFIELD_TOKEN && process.env.HIGGSFIELD_WORKSPACE_ID) {
        return {
            token: process.env.HIGGSFIELD_TOKEN,
            workspaceId: process.env.HIGGSFIELD_WORKSPACE_ID,
            source: 'env'
        };
    }

    const candidates = getCandidateCredPaths();
    for (const c of candidates) {
        try {
            if (fs.existsSync(c.cred) && fs.existsSync(c.conf)) {
                const credData = fs.readJsonSync(c.cred);
                const confData = fs.readJsonSync(c.conf);
                const token = credData.access_token || credData.token;
                const workspaceId = confData.workspace_id || confData.workspaceId;
                if (token && workspaceId) {
                    return {
                        token,
                        workspaceId,
                        source: c.cred
                    };
                }
            }
        } catch (e) {
            // Continuar con el siguiente candidato
        }
    }

    return null;
}

/**
 * Extrae UUID de Job de un string (nombre de archivo, URL, o ID directo)
 */
function extractJobId(input) {
    if (!input || typeof input !== 'string') return null;
    const match = input.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    return match ? match[1].toLowerCase() : null;
}

/**
 * Mapeo de motor Higgsfield (job_type) a sigla canónica oficial del estudio
 * según workflow_ia_pipeline.md
 */
function mapMotorToCanonical(jobType) {
    if (!jobType) return 'SD25';
    const jt = jobType.toLowerCase().trim();
    if (jt === 'seedance_2_5' || jt === 'sd25') return 'SD25';
    if (jt === 'seedance_2_0' || jt === 'seedance_pro' || jt === 'sd2') return 'SD2';
    if (jt === 'seedream_v5_pro' || jt === 'sd5p') return 'SD5P';
    if (jt === 'hf_mult_motion_control' || jt === 'hfmc') return 'HFMC';
    if (jt.includes('veo') && jt.includes('3.1')) return 'VO31';
    if (jt.includes('veo') && jt.includes('3')) return 'VEO3';
    if (jt.includes('banana')) return 'NBN2';
    return jobType.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Mapeo de resolución (ancho x alto) a sigla canónica oficial del estudio
 */
function mapResToCanonical(width, height) {
    if (!width || !height) return 'FHD';
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);

    if (w === 1920 && h === 1080) return 'FHD';
    if (w === 3840 && h === 2160) return 'UHD';
    if (w === 1280 && h === 720) return 'HD';
    if ((w === 1024 && h === 1024) || (w === 1080 && h === 1080)) return 'SQ1K';
    if (w === 2560 && h === 1080) return 'UW2K';
    if (w === 1080 && h === 1920) return '1080x1920';

    return `${w}x${h}`;
}

/**
 * Determina el rol de proceso (Nivel C: v2v, i2v, t2v, t2i)
 */
function determineProcessRole(medias, isVideoOutput = true) {
    if (!Array.isArray(medias) || medias.length === 0) {
        return isVideoOutput ? 't2v' : 't2i';
    }

    const hasVideoInput = medias.some(m => {
        const r = (m.role || '').toLowerCase();
        const t = (m.data?.type || '').toLowerCase();
        const u = (m.data?.url || '').toLowerCase();
        return r.includes('video') || t.includes('video') || u.endsWith('.mp4') || u.endsWith('.mov');
    });

    if (hasVideoInput) return 'v2v';

    const hasImageInput = medias.some(m => {
        const r = (m.role || '').toLowerCase();
        const t = (m.data?.type || '').toLowerCase();
        return r.includes('image') || t.includes('image');
    });

    if (hasImageInput) return isVideoOutput ? 'i2v' : 'i2i';

    return isVideoOutput ? 't2v' : 't2i';
}

const HF_TEMP_CACHE_DIR = path.join(os.tmpdir(), 'pipeta_hf_cache');
try { fs.ensureDirSync(HF_TEMP_CACHE_DIR); } catch (e) {}

/**
 * Consulta los detalles de un Job a la API de Higgsfield
 * Incluye caché temporal local en disco (%TEMP%/pipeta_hf_cache/)
 */
async function fetchJobDetails(jobId) {
    const cleanId = extractJobId(jobId);
    if (!cleanId) {
        throw new Error(`ID de Job inválido o no reconocido: "${jobId}"`);
    }

    // 1. Revisar si ya tenemos en caché temporal o de red el .meta.json de este job
    const cacheFile = path.join(HF_TEMP_CACHE_DIR, `${cleanId}.json`);
    if (fs.existsSync(cacheFile)) {
        try {
            const cached = fs.readJsonSync(cacheFile);
            if (cached && cached.jobId === cleanId && cached.success) {
                return cached;
            }
        } catch (e) {}
    }

    const networkCacheDirs = [
        'Z:/_SYNC_CACHE/higgsfield',
        'S:/_SYNC_CACHE/higgsfield',
        '//192.168.206.116/Z/_SYNC_CACHE/higgsfield'
    ];
    for (const nDir of networkCacheDirs) {
        const nFile = path.join(nDir, `${cleanId}.json`);
        if (fs.existsSync(nFile)) {
            try {
                const cached = fs.readJsonSync(nFile);
                if (cached && cached.jobId === cleanId && cached.success) {
                    return cached;
                }
            } catch (e) {}
        }
    }

    const creds = getCredentials();
    if (!creds) {
        throw new Error("No se encontraron credenciales válidas de Higgsfield en el sistema (credentials.json / config.json).");
    }

    const url = `https://fnf-api-gw.higgsfield.ai/fnf/developer/v2alpha/jobs/${cleanId}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${creds.token}`,
            'hf-workspace-id': creds.workspaceId,
            'User-Agent': 'higgsfield-cli/1.1.26'
        }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error en API de Higgsfield (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const params = data.params || {};
    const medias = Array.isArray(params.medias) ? params.medias : [];

    const isVideo = (data.result_url && (data.result_url.endsWith('.mp4') || data.result_url.endsWith('.mov'))) ||
                    (data.job_type && data.job_type.toLowerCase().includes('dance'));

    const motorCanonical = mapMotorToCanonical(data.job_type);
    const resCanonical = mapResToCanonical(params.width, params.height);
    const roleCanonical = determineProcessRole(medias, isVideo);

    const parsedMedias = medias.map((m, idx) => {
        const itemData = m.data || {};
        return {
            index: idx + 1,
            role: m.role || 'reference',
            type: itemData.type || 'unknown',
            id: itemData.id || null,
            url: itemData.url || null
        };
    });

    const jobMetaResult = {
        success: true,
        jobId: data.id || cleanId,
        jobType: data.job_type,
        displayName: data.display_name,
        status: data.status,
        createdAt: data.created_at,
        prompt: params.prompt || '',
        width: params.width || null,
        height: params.height || null,
        duration: params.duration || null,
        aspectRatio: params.aspect_ratio || null,
        seed: params.seed || null,
        resultUrl: data.result_url,
        thumbnailUrl: data.thumbnail_url,
        motorCanonical,
        resCanonical,
        framingCanonical: 'FLL',
        roleCanonical,
        medias: parsedMedias,
        rawParams: params,
        rawJob: data
    };

    // Guardar en caché temporal y de red para acelerar la ingesta posterior
    try {
        fs.writeJsonSync(cacheFile, jobMetaResult, { spaces: 2 });
    } catch (e) {}

    for (const nDir of networkCacheDirs) {
        try {
            if (!fs.existsSync(nDir)) fs.mkdirSync(nDir, { recursive: true });
            fs.writeJsonSync(path.join(nDir, `${cleanId}.json`), jobMetaResult, { spaces: 2 });
        } catch (e) {}
    }

    return jobMetaResult;
}

/**
 * Descarga un archivo desde una URL directamente a disco usando streams
 */
async function downloadFile(fileUrl, destPath) {
    if (!fileUrl) throw new Error("URL de archivo requerida para la descarga");
    fs.ensureDirSync(path.dirname(destPath));

    const res = await fetch(fileUrl);
    if (!res.ok) {
        throw new Error(`Fallo al descargar archivo desde ${fileUrl} (HTTP ${res.status})`);
    }

    const fileStream = fs.createWriteStream(destPath);
    await finished(Readable.fromWeb(res.body).pipe(fileStream));
    return destPath;
}

/**
 * Genera el ledger de metadatos (.meta.json)
 */
function createLedger(metadata, destJsonPath) {
    fs.ensureDirSync(path.dirname(destJsonPath));
    fs.writeJsonSync(destJsonPath, metadata, { spaces: 2 });
    return destJsonPath;
}

/**
 * Orquestador principal de ingesta de Higgsfield:
 * - Descarga / Copia de archivo fuente
 * - Creación de carpeta de preservación IA/higgsfield/[ORIGINAL_NAME]/
 * - Descarga de referencias a ref/ (si downloadRefs es true)
 * - Creación de ledger .meta.json
 * - Copia a carpetas canónicas (IA/root, etc.) con el nombre canónico y sidecar
 */
async function processHiggsfieldIngest(options) {
    const {
        jobId,
        sourceUrl,
        sourcePath,
        fileData,
        targetShotFolder,
        canonicalName,
        createLedger: shouldCreateLedger = true,
        downloadRefs = false,
        preserveOriginal = true,
        targetSubfolders = ['wip'],
        userName = 'Pipeta',
        framing = null,
        role = null,
        jobDetails: passedJobDetails = null
    } = options;

    if (!targetShotFolder) {
        throw new Error("targetShotFolder es requerido para la ingesta.");
    }
    if (!canonicalName) {
        throw new Error("canonicalName es requerido para la ingesta.");
    }

    // 1. Obtener o inferir Job ID y detalles (usar pre-cargado si existe)
    const resolvedJobId = extractJobId(jobId) || extractJobId(sourceUrl) || extractJobId(sourcePath) || extractJobId(canonicalName);
    
    let jobDetails = passedJobDetails;
    if (!jobDetails && resolvedJobId) {
        try {
            jobDetails = await fetchJobDetails(resolvedJobId);
        } catch (e) {
            console.warn(`[HIGGSFIELD INGEST] No se pudo obtener metadata del Job ${resolvedJobId}: ${e.message}`);
        }
    }

    // 2. Determinar nombre original del archivo
    let originalFileName = '';
    if (sourcePath) {
        originalFileName = path.basename(sourcePath);
    } else if (sourceUrl) {
        const u = sourceUrl.split('?')[0];
        originalFileName = path.basename(u);
    } else if (jobDetails && jobDetails.resultUrl) {
        const u = jobDetails.resultUrl.split('?')[0];
        originalFileName = path.basename(u);
    } else {
        originalFileName = canonicalName;
    }

    const ext = path.extname(originalFileName) || path.extname(canonicalName) || '.mp4';
    const originalBaseName = path.basename(originalFileName, ext);

    // 3. Preparar rutas de preservación en IA/higgsfield/[originalBaseName]/
    const normTarget = path.normalize(targetShotFolder).replace(/\\/g, '/');
    const shotIaRoot = normTarget.toLowerCase().endsWith('/ia') 
        ? normTarget 
        : path.join(targetShotFolder, 'IA');
    const preservationDir = path.join(shotIaRoot, 'higgsfield', originalBaseName);
    const preservedOriginalPath = path.join(preservationDir, originalFileName);

    let tempSource = null;

    // 4. Obtener el archivo físicamente
    if (preserveOriginal) {
        fs.ensureDirSync(preservationDir);
    }

    if (sourcePath && fs.existsSync(sourcePath)) {
        if (preserveOriginal) {
            fs.copyFileSync(sourcePath, preservedOriginalPath);
            tempSource = preservedOriginalPath;
        } else {
            tempSource = sourcePath;
        }
    } else if (sourceUrl || (jobDetails && jobDetails.resultUrl)) {
        const downloadUrl = sourceUrl || jobDetails.resultUrl;
        const targetDownload = preserveOriginal ? preservedOriginalPath : path.join(os.tmpdir(), originalFileName);
        console.log(`[HIGGSFIELD INGEST] Descargando video desde CloudFront: ${downloadUrl}`);
        await downloadFile(downloadUrl, targetDownload);
        tempSource = targetDownload;
    } else if (fileData) {
        const buffer = Buffer.from(fileData, 'base64');
        const targetWrite = preserveOriginal ? preservedOriginalPath : path.join(os.tmpdir(), originalFileName);
        fs.ensureDirSync(path.dirname(targetWrite));
        fs.writeFileSync(targetWrite, buffer);
        tempSource = targetWrite;
    } else {
        throw new Error("No se proporcionó origen de archivo válido (sourcePath, sourceUrl o fileData).");
    }

    // 5. Descarga opcional de referencias a IA/higgsfield/.../ref/ y/o IA/ref/
    const downloadedRefs = [];
    if (downloadRefs && jobDetails && Array.isArray(jobDetails.medias)) {
        const refPreserveDir = path.join(preservationDir, 'ref');
        const refShotDir = path.join(shotIaRoot, 'ref');
        fs.ensureDirSync(refPreserveDir);

        for (const m of jobDetails.medias) {
            if (m.url) {
                try {
                    const cleanRefUrl = m.url.split('?')[0];
                    const refExt = path.extname(cleanRefUrl) || '.png';
                    const refBase = path.basename(cleanRefUrl, refExt);
                    const refFileName = `${m.role || 'ref'}_${refBase}${refExt}`;
                    
                    const destPreserve = path.join(refPreserveDir, refFileName);
                    await downloadFile(m.url, destPreserve);

                    // También copiar a IA/ref si el usuario tiene activado ref en el shot
                    if (fs.existsSync(shotIaRoot)) {
                        fs.ensureDirSync(refShotDir);
                        fs.copyFileSync(destPreserve, path.join(refShotDir, refFileName));
                    }

                    downloadedRefs.push({
                        role: m.role,
                        fileName: refFileName,
                        savedPath: destPreserve
                    });
                } catch (refErr) {
                    console.warn(`[HIGGSFIELD INGEST] Error al descargar referencia ${m.url}: ${refErr.message}`);
                }
            }
        }
    }

    // 6. Guardar metadatos originales crudos de Higgsfield en la carpeta de preservación (100% puro y original de la API de Higgsfield)
    if (preserveOriginal && shouldCreateLedger) {
        let rawHiggsfieldBackup = (jobDetails && jobDetails.rawJob) ? jobDetails.rawJob : null;
        if (!rawHiggsfieldBackup && resolvedJobId) {
            try {
                const creds = getCredentials();
                if (creds) {
                    const r = await fetch(`https://fnf-api-gw.higgsfield.ai/fnf/developer/v2alpha/jobs/${resolvedJobId}`, {
                        headers: {
                            'Authorization': `Bearer ${creds.token}`,
                            'hf-workspace-id': creds.workspaceId,
                            'User-Agent': 'higgsfield-cli/1.1.26'
                        }
                    });
                    if (r.ok) rawHiggsfieldBackup = await r.json();
                }
            } catch (e) {}
        }
        if (!rawHiggsfieldBackup) {
            rawHiggsfieldBackup = { id: resolvedJobId };
        }

        const ledgerPath = path.join(preservationDir, `${originalBaseName}.meta.json`);
        createLedger(rawHiggsfieldBackup, ledgerPath);
    }

    // 7. Construir Sidecar Canónico de Pipeta para los destinos del shot (sin duplicar prompt ni extensiones)
    const canonicalBaseNoExt = canonicalName.replace(/\.[^/.]+$/, '');
    const canonicalSidecarData = {
        lasp_name: canonicalName,
        original_name: originalFileName,
        ingested_at: new Date().toISOString(),
        ingested_by: userName,
        pipeline: {
            engine: jobDetails ? jobDetails.motorCanonical : 'SD25',
            resolution: jobDetails ? jobDetails.resCanonical : 'FHD',
            framing: framing || (jobDetails ? jobDetails.framingCanonical : 'FLL'),
            role: role || (jobDetails ? jobDetails.roleCanonical : 'v2v')
        },
        higgsfield: {
            job_id: resolvedJobId || null,
            job_type: jobDetails ? jobDetails.jobType : null,
            display_name: jobDetails ? jobDetails.displayName : null,
            model_mode: (jobDetails && jobDetails.rawParams) ? jobDetails.rawParams.model : null,
            prompt: jobDetails ? jobDetails.prompt : '',
            width: jobDetails ? jobDetails.width : null,
            height: jobDetails ? jobDetails.height : null,
            duration: jobDetails ? jobDetails.duration : null,
            aspect_ratio: jobDetails ? jobDetails.aspectRatio : null,
            created_at: jobDetails ? jobDetails.createdAt : null,
            result_url: jobDetails ? jobDetails.resultUrl : (sourceUrl || null),
            thumbnail_url: jobDetails ? jobDetails.thumbnailUrl : null,
            references: downloadedRefs
        }
    };

    // 8. Copiar archivo canónico y sidecar .meta.json a los destinos seleccionados
    const destinationOutputs = [];
    const subfolderMap = {
        'wip': shotIaRoot,
        'root': shotIaRoot,
        'ref': path.join(shotIaRoot, 'ref'),
        'export': path.join(shotIaRoot, 'export')
    };

    const targetDirs = new Set();
    if (Array.isArray(targetSubfolders) && targetSubfolders.length > 0) {
        for (const sub of targetSubfolders) {
            const mapped = subfolderMap[sub.toLowerCase()] || shotIaRoot;
            targetDirs.add(mapped);
        }
    } else {
        targetDirs.add(shotIaRoot);
    }

    for (const targetDir of targetDirs) {
        fs.ensureDirSync(targetDir);
        const destCanonicalPath = path.join(targetDir, canonicalName);
        fs.copyFileSync(tempSource, destCanonicalPath);

        // Guardar sidecar .meta.json en el destino (reemplaza .mp4 por .meta.json, sin duplicar extensión)
        if (shouldCreateLedger) {
            const sidecarMetaPath = path.join(targetDir, `${canonicalBaseNoExt}.meta.json`);
            createLedger(canonicalSidecarData, sidecarMetaPath);
        }

        destinationOutputs.push(destCanonicalPath);
    }

    return {
        success: true,
        jobId: resolvedJobId,
        canonicalName,
        targetFile: destinationOutputs[0] || null,
        destinations: destinationOutputs,
        preservedFolder: preserveOriginal ? preservationDir : null,
        ledgerCreated: shouldCreateLedger,
        refsDownloadedCount: downloadedRefs.length
    };
}

module.exports = {
    getCredentials,
    extractJobId,
    mapMotorToCanonical,
    mapResToCanonical,
    determineProcessRole,
    fetchJobDetails,
    downloadFile,
    createLedger,
    processHiggsfieldIngest
};
