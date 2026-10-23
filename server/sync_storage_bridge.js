/**
 * sync_storage_bridge.js
 * Puente continuo entre el almacenamiento central del estudio (montado en VM 111: /mnt/z/_SYNC_CACHE)
 * y el servidor central Pipeta en el contenedor LXC 121 (/opt/_SYNC_CACHE).
 */

const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const REMOTE_SSH = 'ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=2 lasp-linux@192.168.206.111';
const LOCAL_DIR = '/opt/_SYNC_CACHE';

fs.ensureDirSync(path.join(LOCAL_DIR, 'workers'));
fs.ensureDirSync(path.join(LOCAL_DIR, 'requests'));
fs.ensureDirSync(path.join(LOCAL_DIR, 'projects'));

let isSyncingFast = false;
let isSyncingProjects = false;

// Sincronización ultrarrápida de telemetría y órdenes cada 1.5s
function syncFastLoop() {
    if (isSyncingFast) return;
    isSyncingFast = true;

    const cmd = `${REMOTE_SSH} 'tar -C /mnt/z/_SYNC_CACHE -cf - workers requests 2>/dev/null' | tar -C ${LOCAL_DIR} -xf - 2>/dev/null`;

    exec(cmd, { timeout: 3500 }, (err) => {
        isSyncingFast = false;
    });
}

// Sincronización incremental de catálogos (Drive y Server) cada 15s con rsync
function syncProjectsLoop() {
    if (isSyncingProjects) return;
    isSyncingProjects = true;

    const rsyncCmd = `rsync -az --delete -e 'ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=3' lasp-linux@192.168.206.111:/mnt/z/_SYNC_CACHE/projects/ /opt/_SYNC_CACHE/projects/`;

    exec(rsyncCmd, { timeout: 12000 }, (err) => {
        isSyncingProjects = false;
    });
}

setInterval(syncFastLoop, 1500);
setInterval(syncProjectsLoop, 15000);

syncFastLoop();
syncProjectsLoop();

console.log('[STORAGE BRIDGE] Puente activo: workers/requests (1.5s) y proyectos/catálogos (15s)');
