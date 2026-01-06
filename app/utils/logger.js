import fs from "fs/promises";
import path from "path";
import { app } from "electron";

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

class Logger {
    constructor() {
        this.logDir = path.join(app.getPath("userData"), "logs");
        this.currentLogFile = null;
        this.currentDate = null;
        const isDev = process.env.NODE_ENV === "development";
        this.minLevel = isDev ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
        this.initPromise = this.init();
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

    async cleanOldLogs() {
        try {
            const files = await fs.readdir(this.logDir);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000;

            for (const file of files) {
                if (!file.startsWith("app-") || !file.endsWith(".log")) continue;

                const filePath = path.join(this.logDir, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtimeMs > maxAge) {
                    await fs.unlink(filePath);
                    console.log(`[Logger] deleted old log: ${file}`);
                }
            }
        } catch (err) {
            console.error("[Logger] cleanup failed:", err);
        }
    }

    formatMessage(level, message, context) {
        const now = new Date();
        const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const timestamp = vnTime.toISOString().replace('T', ' ').replace('Z', '');

        const levelStr = Object.keys(LOG_LEVELS).find(
            (k) => LOG_LEVELS[k] === level
        );

        let msg = `[${timestamp}] [${levelStr}] ${message}`;

        if (context && Object.keys(context).length > 0) {
            msg += ` ${JSON.stringify(context)}`;
        }

        return msg;
    }

    async writeToFile(message) {
        try {
            await this.initPromise;
            this.updateLogFile();

            if (this.currentLogFile) {
                await fs.appendFile(this.currentLogFile, message + "\n", "utf8");
            }
        } catch (err) {
            console.error("[Logger] write failed:", err);
        }
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

        this.writeToFile(formatted).catch(() => { });
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
