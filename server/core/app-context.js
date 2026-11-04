const path = require('path');
const os = require('os');
const fs = require('fs-extra');

const SERVER_DIR = path.resolve(__dirname, '..');
const APP_ROOT = path.resolve(__dirname, '../..');
const UI_PATH = path.join(APP_ROOT, 'ui');

let meta = {};
const versionJsonPath = path.join(APP_ROOT, 'version.json');
try {
    if (fs.existsSync(versionJsonPath)) {
        meta = fs.readJsonSync(versionJsonPath) || {};
    }
} catch (e) {}

const VERSION = meta.version || 'v2.0.0-beta.1';
const CHANNEL = meta.channel || (VERSION.includes('beta') ? 'beta' : 'stable');
const IS_BETA = CHANNEL === 'beta' || VERSION.includes('beta');
const APP_NAME = meta.appName || (IS_BETA ? 'PIPETA BETA' : 'PIPETA');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (meta.port || (IS_BETA ? 3050 : 3002));

const LOCAL_APP_DIR = meta.localDir || (IS_BETA ? 'C:\\TOOLS\\APPS\\Pipeta_Beta' : 'C:\\TOOLS\\APPS\\Pipeta');
const NETWORK_APP_DIR = meta.networkDir || (IS_BETA ? 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta_Beta' : 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta');
const PROD_STUDIO_DIR = meta.prodStudioDir || (IS_BETA ? 'S:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta_Beta' : 'S:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta');
const SHORTCUT_NAME = meta.shortcutName || (IS_BETA ? 'Pipeta Beta.lnk' : 'Pipeta.lnk');
const LAUNCHER_BAT = meta.launcherBat || (IS_BETA ? 'Launch_Pipeta_Beta.bat' : 'Launch_Pipeta.bat');
const UPDATER_BAT = meta.updaterBat || (IS_BETA ? 'Actualizar_Pipeta_Beta_desde_Red.bat' : 'Actualizar_Pipeta_desde_Red.bat');

const LOGS_DIR = path.join(APP_ROOT, 'logs');
const REPORTS_DIR = path.join(LOGS_DIR, 'reports');

const RESTART_FLAG_FILE = path.join(os.tmpdir(), IS_BETA ? 'pipeta_beta_restarting.flag' : 'pipeta_restarting.flag');
const UPDATING_FLAG_FILE = path.join(os.tmpdir(), IS_BETA ? 'pipeta_beta_updating.flag' : 'pipeta_updating.flag');

const ENV_STATE_FILE = path.join(
    process.env.LOCALAPPDATA || process.env.TEMP || SERVER_DIR,
    IS_BETA ? 'Pipeta_Beta_env_state.json' : 'Pipeta_env_state.json'
);

const USERS_CONFIG_FILE = path.join(APP_ROOT, 'presets/users_config.json');
const STATUS_CONFIG_FILE = path.join(APP_ROOT, 'presets/status_config.json');
const CUSTOM_TOKENS_FILE = path.join(APP_ROOT, 'presets/ia_custom_tokens.json');
const PIPELINE_CONFIG_FILE = path.join(APP_ROOT, 'pipeline_config.json');

const runtimeState = {
    SERVER_BOOT_TIME: Date.now(),
    hasActiveBrowserClient: false,
    activeRamonUser: '',
    isRemoteUpdating: false,
    lastConfigSyncTimestamp: 0,
    cachedEnvState: null,
    localWorkerPid: null,
    localWorkerProcess: null
};

module.exports = {
    VERSION,
    CHANNEL,
    IS_BETA,
    APP_NAME,
    PORT,
    SERVER_DIR,
    APP_ROOT,
    UI_PATH,
    LOCAL_APP_DIR,
    NETWORK_APP_DIR,
    PROD_STUDIO_DIR,
    SHORTCUT_NAME,
    LAUNCHER_BAT,
    UPDATER_BAT,
    LOGS_DIR,
    REPORTS_DIR,
    RESTART_FLAG_FILE,
    UPDATING_FLAG_FILE,
    ENV_STATE_FILE,
    USERS_CONFIG_FILE,
    STATUS_CONFIG_FILE,
    CUSTOM_TOKENS_FILE,
    PIPELINE_CONFIG_FILE,
    runtimeState
};
