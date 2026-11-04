const path = require('path');
const fs = require('fs-extra');
const { LOGS_DIR, REPORTS_DIR } = require('./app-context');

try {
    fs.ensureDirSync(LOGS_DIR);
    fs.ensureDirSync(REPORTS_DIR);
} catch (e) {}

function _formatTimestamp() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `[${hh}:${mm}:${ss}]`;
}

function getTodayLogPath() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(LOGS_DIR, `pipeta_${today}.log`);
}

function getTodayErrorLogPath() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(LOGS_DIR, `pipeta_errors_${today}.log`);
}

function writeServerLog(source, type, message, status = 'info') {
    try {
        const now = new Date();
        const timeStr = now.toISOString().replace('T', ' ').substring(0, 23);
        const logLine = `[${timeStr}] [${source.toUpperCase()}] [${type.toUpperCase()}/${status.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(getTodayLogPath(), logLine, 'utf8');

        const isErr = status === 'error' || type === 'error' || status === 'critical' || status === 'CRITICAL' || status === 'ERROR';
        if (isErr) {
            fs.appendFileSync(getTodayErrorLogPath(), logLine, 'utf8');
        }
    } catch (e) {}
}

let state = global.__PIPETA_LOGGER_STATE__;

function initLogger() {
    if (global.__PIPETA_LOGGER_STATE__) {
        return global.__PIPETA_LOGGER_STATE__;
    }

    const _origLog = console.log.bind(console);
    const _origWarn = console.warn.bind(console);
    const _origError = console.error.bind(console);
    const _origInfo = console.info.bind(console);

    const tsLog = function (...args) { _origLog(_formatTimestamp(), ...args); };
    const tsWarn = function (...args) { _origWarn(_formatTimestamp(), ...args); };
    const tsError = function (...args) { _origError(_formatTimestamp(), ...args); };
    const tsInfo = function (...args) { _origInfo(_formatTimestamp(), ...args); };

    const origConsoleLog = tsLog;
    const origConsoleError = tsError;
    const origConsoleWarn = tsWarn;

    console.log = function (...args) {
        origConsoleLog.apply(console, args);
        try {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            writeServerLog('server', 'info', msg, 'info');
        } catch (e) {}
    };

    console.error = function (...args) {
        origConsoleError.apply(console, args);
        try {
            const msg = args.map(a => typeof a === 'object' ? ((a && a.stack) || JSON.stringify(a)) : String(a)).join(' ');
            writeServerLog('server', 'error', msg, 'error');
        } catch (e) {}
    };

    console.warn = function (...args) {
        origConsoleWarn.apply(console, args);
        try {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            writeServerLog('server', 'warn', msg, 'warn');
        } catch (e) {}
    };

    console.info = tsInfo;

    process.on('uncaughtException', (err) => {
        origConsoleError('[CRITICAL UNCAUGHT EXCEPTION]', err);
        try {
            writeServerLog('server', 'error', `[UNCAUGHT EXCEPTION] ${(err && err.stack) || (err && err.message) || err}`, 'critical');
        } catch (e) {}
    });

    process.on('unhandledRejection', (reason) => {
        origConsoleError('[UNHANDLED PROMISE REJECTION]', reason);
        try {
            const rStr = (reason && reason.stack) ? reason.stack : String(reason);
            writeServerLog('server', 'error', `[UNHANDLED REJECTION] ${rStr}`, 'error');
        } catch (e) {}
    });

    global.__PIPETA_LOGGER_STATE__ = {
        _origLog,
        _origWarn,
        _origError,
        _origInfo,
        origConsoleLog,
        origConsoleError,
        origConsoleWarn
    };
    state = global.__PIPETA_LOGGER_STATE__;
    return state;
}

initLogger();

module.exports = {
    initLogger,
    getTodayLogPath,
    getTodayErrorLogPath,
    writeServerLog,
    _origLog: state._origLog,
    _origWarn: state._origWarn,
    _origError: state._origError,
    _origInfo: state._origInfo,
    origConsoleLog: state.origConsoleLog,
    origConsoleError: state.origConsoleError,
    origConsoleWarn: state.origConsoleWarn
};
