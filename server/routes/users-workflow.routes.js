const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const {
    USERS_CONFIG_FILE,
    STATUS_CONFIG_FILE
} = require('../core/app-context');

const router = express.Router();

function sanitizeUsersConfig(data) {
    if (!data || !Array.isArray(data.users)) return false;
    let modified = false;
    data.users.forEach(u => {
        if (u.id === 'u_admin' || u.username === 'admin' || (u.isSystem && u.role === 'admin')) {
            if (u.authSource) {
                delete u.authSource;
                modified = true;
            }
            if (u.laspUser === 'lasp-admin') {
                u.laspUser = '';
                modified = true;
            }
            if (u.firstName === 'Admin') {
                u.firstName = '';
                modified = true;
            }
            if (u.isSystem !== true) {
                u.isSystem = true;
                modified = true;
            }
            if (u.avatarColor !== '#ff9800') {
                u.avatarColor = '#ff9800';
                modified = true;
            }
        }
    });
    return modified;
}

// --- USERS & ROLES CONFIGURATION ---
router.get('/api/users', async (req, res) => {
    try {
        if (!fs.existsSync(USERS_CONFIG_FILE)) {
            return res.json({ adminPassword: 'Pipetadmin.321', roles: [], users: [], activeUser: '' });
        }
        const data = await fs.readJson(USERS_CONFIG_FILE);
        const wasSanitized = sanitizeUsersConfig(data);
        if (wasSanitized) {
            fs.writeJson(USERS_CONFIG_FILE, data, { spaces: 2 }).catch(e => console.warn('[USERS] Error auto-healing config:', e));
        }
        const safeData = { ...data, hasAdminPassword: !!data.adminPassword, isExternalMachine: !!global.isExternalMachine };
        delete safeData.adminPassword;
        res.json(safeData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/users', async (req, res) => {
    try {
        const current = fs.existsSync(USERS_CONFIG_FILE) ? await fs.readJson(USERS_CONFIG_FILE) : {};
        const incoming = req.body || {};
        sanitizeUsersConfig(incoming);

        if (!incoming.adminPassword && current.adminPassword) {
            incoming.adminPassword = current.adminPassword;
        }

        await fs.ensureDir(path.dirname(USERS_CONFIG_FILE));
        await fs.writeJson(USERS_CONFIG_FILE, incoming, { spaces: 2 });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/users/verify-admin', async (req, res) => {
    try {
        const { password } = req.body;
        let adminPass = 'Pipetadmin.321';
        if (fs.existsSync(USERS_CONFIG_FILE)) {
            const data = await fs.readJson(USERS_CONFIG_FILE);
            if (data.adminPassword) adminPass = data.adminPassword;
        }
        if (password === adminPass) {
            res.json({ success: true, authorized: true });
        } else {
            res.status(401).json({ success: false, authorized: false, error: 'Contraseña de administrador incorrecta' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/users/set-active', async (req, res) => {
    try {
        const { laspUser } = req.body;
        if (!laspUser) return res.status(400).json({ error: 'No user specified' });
        if (fs.existsSync(USERS_CONFIG_FILE)) {
            const data = await fs.readJson(USERS_CONFIG_FILE);
            data.activeUser = laspUser;
            await fs.writeJson(USERS_CONFIG_FILE, data, { spaces: 2 });
        }
        res.json({ success: true, activeUser: laspUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- STATUS CONFIGURATION ---
router.get('/api/statuses', async (req, res) => {
    try {
        if (!fs.existsSync(STATUS_CONFIG_FILE)) {
            return res.json({ statuses: [] });
        }
        const data = await fs.readJson(STATUS_CONFIG_FILE);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/statuses', async (req, res) => {
    try {
        await fs.ensureDir(path.dirname(STATUS_CONFIG_FILE));
        await fs.writeJson(STATUS_CONFIG_FILE, req.body, { spaces: 2 });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- WORKFLOW & SHOT TRACKER API ---
router.post('/api/workflow/shot-tracker/load', async (req, res) => {
    try {
        const { projectPath, workflowDir } = req.body;
        if (!projectPath) return res.status(400).json({ error: 'No projectPath specified' });

        const effectiveWorkflowDir = workflowDir || path.join(projectPath, 'workflow');
        const trackerFile = path.join(effectiveWorkflowDir, 'shot_tracker.json');

        let trackerData = { projectPath, shots: {}, updatedAt: new Date().toISOString() };
        let exists = false;
        if (fs.existsSync(trackerFile)) {
            exists = true;
            try {
                trackerData = await fs.readJson(trackerFile);
            } catch (e) {
                console.warn('[WORKFLOW] Error reading trackerFile:', e);
            }
        }

        res.json({ success: true, trackerFile: exists ? trackerFile : null, exists, trackerData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/workflow/shot-tracker/save', async (req, res) => {
    try {
        const { workflowDir, trackerData } = req.body;
        if (!workflowDir || !trackerData) return res.status(400).json({ error: 'Missing workflowDir or trackerData' });

        const projectRoot = path.dirname(workflowDir);
        if (!fs.existsSync(projectRoot)) {
            return res.json({ success: false, skipped: true, reason: 'Project root does not exist on disk' });
        }

        await fs.ensureDir(workflowDir);
        const trackerFile = path.join(workflowDir, 'shot_tracker.json');
        trackerData.updatedAt = new Date().toISOString();
        await fs.writeJson(trackerFile, trackerData, { spaces: 2 });

        res.json({ success: true, trackerFile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/workflow/user-tasks/export', async (req, res) => {
    try {
        const { workflowDir, laspUser, userTasks, projectInfo } = req.body;
        if (!workflowDir || !laspUser) return res.status(400).json({ error: 'Missing parameters' });

        const assignmentsDir = path.join(workflowDir, 'assignments');
        await fs.ensureDir(assignmentsDir);
        const userFile = path.join(assignmentsDir, `tasks_${laspUser}.json`);

        const payload = {
            laspUser,
            exportedAt: new Date().toISOString(),
            project: projectInfo || {},
            tasksCount: (userTasks || []).length,
            tasks: userTasks || []
        };

        await fs.writeJson(userFile, payload, { spaces: 2 });
        res.json({ success: true, filePath: userFile, payload });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/workflow/user-tasks/load', async (req, res) => {
    try {
        const { workflowDir, laspUser } = req.body;
        if (!workflowDir || !laspUser) return res.status(400).json({ error: 'Missing parameters' });

        const userFile = path.join(workflowDir, 'assignments', `tasks_${laspUser}.json`);
        if (!fs.existsSync(userFile)) {
            return res.status(404).json({ error: `No se encontraron tareas asignadas para el usuario ${laspUser}` });
        }

        const data = await fs.readJson(userFile);
        res.json({ success: true, userTasks: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/workflow/ensure-process-folders', async (req, res) => {
    try {
        const { folderPaths } = req.body;
        if (!Array.isArray(folderPaths) || folderPaths.length === 0) {
            return res.status(400).json({ error: 'No folder paths provided' });
        }

        const created = [];
        for (const f of folderPaths) {
            const clean = path.resolve(f.replace(/\//g, '\\'));
            if (!fs.existsSync(clean)) {
                await fs.ensureDir(clean);
                created.push(clean);
            }
        }

        res.json({ success: true, createdCount: created.length, createdFolders: created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.sanitizeUsersConfig = sanitizeUsersConfig;

module.exports = router;
