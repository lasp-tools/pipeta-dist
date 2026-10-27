/**
 * sync_storage_bridge.js
 * Puente continuo entre el almacenamiento central del estudio (montado en VM 111: /mnt/z/_SYNC_CACHE)
 * y el servidor central Pipeta en el contenedor LXC 121 (/opt/_SYNC_CACHE).
 */

const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const SSH_OPTS = "-e 'ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=2'";
const REMOTE_HOST = "lasp-linux@192.168.206.111";
const LOCAL_DIR = '/opt/_SYNC_CACHE';

fs.ensureDirSync(path.join(LOCAL_DIR, 'workers'));
fs.ensureDirSync(path.join(LOCAL_DIR, 'requests'));
fs.ensureDirSync(path.join(LOCAL_DIR, 'projects'));
fs.ensureDirSync(path.join(LOCAL_DIR, 'clients'));

let isSyncingFast = false;
let isSyncingProjects = false;

// Sincronización continua de telemetría, órdenes y clientes con propagación de borrados (--delete) cada 2s
function syncFastLoop() {
    if (isSyncingFast) return;
    isSyncingFast = true;

    const cmd = `rsync -az --delete ${SSH_OPTS} ${REMOTE_HOST}:/mnt/z/_SYNC_CACHE/requests/ ${LOCAL_DIR}/requests/ && rsync -az --delete ${SSH_OPTS} ${REMOTE_HOST}:/mnt/z/_SYNC_CACHE/workers/ ${LOCAL_DIR}/workers/ && rsync -az --delete ${SSH_OPTS} ${REMOTE_HOST}:/mnt/z/_SYNC_CACHE/clients/ ${LOCAL_DIR}/clients/`;

    exec(cmd, { timeout: 5000 }, (err) => {
        isSyncingFast = false;
    });
}

// Sincronización incremental de catálogos (Drive y Server) cada 15s con rsync
function syncProjectsLoop() {
    if (isSyncingProjects) return;
    isSyncingProjects = true;

    const rsyncCmd = `rsync -az --delete -e 'ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=3' ${REMOTE_HOST}:/mnt/z/_SYNC_CACHE/projects/ /opt/_SYNC_CACHE/projects/`;

    exec(rsyncCmd, { timeout: 12000 }, (err) => {
        isSyncingProjects = false;
    });
}

setInterval(syncFastLoop, 2000);
setInterval(syncProjectsLoop, 15000);

syncFastLoop();
syncProjectsLoop();

console.log('[STORAGE BRIDGE] Puente activo: requests, workers, clients y projects');
