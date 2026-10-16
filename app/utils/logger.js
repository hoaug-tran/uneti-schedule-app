import fs from "fs/promises";
import path from "path";
import { app } from "electron";

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const SENSITIVE_KEY_REGEX = /(password|passwd|pwd|access_?token|refresh_?token|token|cookies?|secret|student_?id|ma_?sinh_?vien|masv|credential|authorization)/i;

function redactSensitiveText(text) {
    if (typeof text !== "string") return text;
    return text
        .replace(/(["']authorization["']\s*:\s*["'])[^"']*(["'])/gi, "$1[REDACTED]$2")
        .replace(/https?:\/\/[^\s"'<>]+/g, match => { try { const url = new URL(match); return url.origin + url.pathname; } catch { return "[REDACTED_URL]"; } })
        .replace(/\b(Cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
        .replace(/\b(Authorization\s*:\s*)(Bearer\s+)?[^\r\n]+/gi, (_match, prefix, bearer) => prefix + (bearer || "") + "[REDACTED]")
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g, "[REDACTED_JWT]")
        .replace(/(Bearer\s+)(?!\[REDACTED\])[^\s;\[\]]+/gi, "$1[REDACTED]")
        .replace(/(["']?(?:password|passwd|pwd|token|access_token|refresh_token|cookie|cookies|studentId|student_id|maSinhVien|masv|secret|session)["']?\s*[:=]\s*["']?)(?!\[REDACTED(?:_JWT)?\])[^"',;\s}\[\]]+(["']?)/gi, "$1[REDACTED]$2");
}

export function sanitizeLogText(text) {
    if (typeof text !== "string") return text;
    return redactSensitiveText(text);
}

function redactValue(val, seen = new WeakSet()) {
    if (val === null || val === undefined) return val;
    if (typeof val === "string") {
        return sanitizeLogText(val);
    }
    if (typeof val === "number" || typeof val === "boolean" || typeof val === "symbol" || typeof val === "bigint") {
        return val;
    }
    if (typeof val === "object") {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);

        if (Array.isArray(val)) {
            return val.map((item) => redactValue(item, seen));
        }

        if (val instanceof Error) {
            return {
                name: val.name,
                message: sanitizeLogText(val.message),
                stack: sanitizeLogText(val.stack),
            };
        }

        const result = {};
        for (const [k, v] of Object.entries(val)) {
            if (SENSITIVE_KEY_REGEX.test(k)) {
                result[k] = "[REDACTED]";
            } else {
                result[k] = redactValue(v, seen);
            }
        }
        return result;
    }
    return val;
}

export class Logger {
    constructor(options = {}) {
        let userDataPath = "";
        try {
            if (app && typeof app.getPath === "function") {
                userDataPath = app.getPath("userData");
            }
        } catch {
            userDataPath = process.cwd();
        }
        if (!userDataPath) userDataPath = process.cwd();

        this.logDir = options.logDir || path.join(userDataPath, "logs");
        this.currentLogFile = null;
        this.currentDate = null;
        this.maxFileSize = options.maxFileSize || MAX_FILE_SIZE;
        this.maxTotalSize = options.maxTotalSize || MAX_TOTAL_SIZE;
        this.maxLogAgeMs = options.maxLogAgeMs || MAX_LOG_AGE_MS;

        const isDev = process.env.NODE_ENV === "development";
        this.minLevel = isDev ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

        this.writeChain = Promise.resolve();
        this.initPromise = this.init();

        this.cleanupTimer = setInterval(() => {
            this.cleanOldLogs().catch(() => {});
        }, CLEANUP_INTERVAL_MS);
        if (this.cleanupTimer && typeof this.cleanupTimer.unref === "function") {
            this.cleanupTimer.unref();
        }
    }

    async init() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
            await this.cleanOldLogs();
            this.updateLogFile();
        } catch (err) {
            console.error("[Logger] init failed:", err);
        }
    }

    updateLogFile() {
        const now = new Date();
        const dateStr = now.toISOString().split("T")[0];

        if (this.currentDate !== dateStr) {
            this.currentDate = dateStr;
            this.currentLogFile = path.join(this.logDir, `app-${dateStr}.log`);
        }
    }

    async rotateIfNeeded() {
        if (!this.currentLogFile) return;
        try {
            const stats = await fs.stat(this.currentLogFile).catch(() => null);
            if (!stats || stats.size < this.maxFileSize) return;

            const dateStr = this.currentDate;
            let index = 1;
            while (index < 100) {
                const candidate = path.join(this.logDir, `app-${dateStr}.${index}.log`);
                const exists = await fs.stat(candidate).then(() => true, () => false);
                if (!exists) {
                    await fs.rename(this.currentLogFile, candidate);
                    await this.cleanOldLogs();
                    break;
                }
                index++;
            }
        } catch (err) {
            console.error("[Logger] rotate failed:", err);
        }
    }

    async cleanOldLogs() {
        try {
            const files = await fs.readdir(this.logDir);
            const now = Date.now();
            const logFiles = [];

            for (const file of files) {
                if (!file.startsWith("app-") || !file.endsWith(".log")) continue;

                const filePath = path.join(this.logDir, file);
                try {
                    const stats = await fs.stat(filePath);
                    if (now - stats.mtimeMs > this.maxLogAgeMs) {
                        await fs.unlink(filePath);
                        console.log(`[Logger] deleted old log: ${file}`);
                    } else {
                        logFiles.push({ file, filePath, mtimeMs: stats.mtimeMs, size: stats.size });
                    }
                } catch {
                    // ignore
                }
            }

            let totalSize = logFiles.reduce((acc, f) => acc + f.size, 0);
            if (totalSize > this.maxTotalSize) {
                logFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);
                for (const f of logFiles) {
                    if (f.filePath === this.currentLogFile && logFiles.length > 1) continue;
                    try {
                        await fs.unlink(f.filePath);
                        totalSize -= f.size;
                        console.log(`[Logger] pruned log to stay under size limit: ${f.file}`);
                    } catch {
                        // ignore
                    }
                    if (totalSize <= this.maxTotalSize) break;
                }
            }
        } catch (err) {
            console.error("[Logger] cleanup failed:", err);
        }
    }

    formatMessage(level, message, context) {
        const now = new Date();
        const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const timestamp = vnTime.toISOString().replace("T", " ").replace("Z", "");

        const levelStr = Object.keys(LOG_LEVELS).find(
            (k) => LOG_LEVELS[k] === level
        ) || "INFO";

        const cleanMessage = sanitizeLogText(String(message ?? ""));
        let msg = `[${timestamp}] [${levelStr}] ${cleanMessage}`;

        if (context !== null && context !== undefined) {
            if (typeof context === "object") {
                const keys = Object.keys(context);
                if (keys.length > 0 || Array.isArray(context) || context instanceof Error) {
                    try {
                        const redacted = redactValue(context);
                        msg += ` ${JSON.stringify(redacted)}`;
                    } catch {
                        msg += ` [Context unstringifiable]`;
                    }
                }
            } else {
                msg += ` ${sanitizeLogText(String(context))}`;
            }
        }

        return msg;
    }

    writeToFile(message) {
        this.writeChain = this.writeChain.then(async () => {
            try {
                await this.initPromise;
                this.updateLogFile();
                await this.rotateIfNeeded();
                if (this.currentLogFile) {
                    await fs.appendFile(this.currentLogFile, message + "\n", "utf8");
                }
            } catch (err) {
                console.error("[Logger] write failed:", err);
            }
        });
        return this.writeChain;
    }

    async flush() {
        await this.initPromise;
        await this.writeChain;
    }

    async close() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        await this.flush();
    }

    log(level, message, context = {}) {
        if (level < this.minLevel) return;

        const formatted = this.formatMessage(level, message, context);

        if (level === LOG_LEVELS.ERROR) {
            console.error(formatted);
        } else if (level === LOG_LEVELS.WARN) {
            console.warn(formatted);
        } else {
            console.log(formatted);
        }

        this.writeToFile(formatted).catch(() => {});
    }

    debug(message, context) {
        this.log(LOG_LEVELS.DEBUG, message, context);
    }

    info(message, context) {
        this.log(LOG_LEVELS.INFO, message, context);
    }

    warn(message, context) {
        this.log(LOG_LEVELS.WARN, message, context);
    }

    error(message, context) {
        this.log(LOG_LEVELS.ERROR, message, context);
    }

    setLevel(level) {
        if (typeof level === "string") {
            this.minLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
        } else {
            this.minLevel = level;
        }
    }

    getLogDir() {
        return this.logDir;
    }

    getCurrentLogFile() {
        this.updateLogFile();
        return this.currentLogFile;
    }
}

export const logger = new Logger();
export { LOG_LEVELS };
export default logger;
