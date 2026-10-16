import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";

async function loadModule(filePath, mockedModules = {}) {
    const absolutePath = path.resolve(filePath);
    const sourceCode = await fs.readFile(absolutePath, "utf8");

    const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Date,
        URL,
        AbortController,
        AbortSignal,
        Buffer,
        process,
    });

    const module = new vm.SourceTextModule(sourceCode, {
        context,
        identifier: absolutePath,
        initializeImportMeta(meta) {
            meta.url = `file://${absolutePath}`;
        },
    });

    await module.link(async (specifier) => {
        if (mockedModules[specifier]) {
            const mockObj = mockedModules[specifier];
            const exportKeys = Object.keys(mockObj);
            return new vm.SyntheticModule(
                exportKeys,
                function () {
                    for (const k of exportKeys) {
                        this.setExport(k, mockObj[k]);
                    }
                },
                { context }
            );
        }

        if (specifier === "fs/promises" || specifier === "path" || specifier.startsWith("node:")) {
            const real = await import(specifier);
            const exportKeys = Object.keys(real);
            return new vm.SyntheticModule(
                exportKeys,
                function () {
                    for (const k of exportKeys) {
                        this.setExport(k, real[k]);
                    }
                },
                { context }
            );
        }

        throw new Error(`Unmocked dependency in test: ${specifier}`);
    });

    await module.evaluate();
    return module.namespace;
}

test("logger: redactSensitiveText removes tokens, cookies, passwords, student IDs, and URL queries", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uneti-logger-redact-"));
    const loggerMod = await loadModule("app/utils/logger.js", {
        electron: { app: { getPath: () => tempDir } },
    });

    const { sanitizeLogText } = loggerMod;

    const inputUrl = "https://support.uneti.edu.vn/api/test?token=secret123&user=admin";
    assert.equal(sanitizeLogText(inputUrl), "https://support.uneti.edu.vn/api/test");

    const inputJwt = "User auth eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakSignature string";
    assert.match(sanitizeLogText(inputJwt), /\[REDACTED_JWT\]/);
    assert.doesNotMatch(sanitizeLogText(inputJwt), /doNotLeakSignature/);

    const inputBearer = "Authorization: Bearer secret-bearer-token-123456";
    assert.equal(sanitizeLogText(inputBearer), "Authorization: Bearer [REDACTED]");
    assert.equal(sanitizeLogText("Authorization: Bearer [REDACTED]"), "Authorization: Bearer [REDACTED]");

    const inputCookies = "Cookie: access_token=secretValue; student_id=21107100000; session=sid123; safe=ok";
    const sanitizedCookies = sanitizeLogText(inputCookies);
    assert.equal(sanitizedCookies, "Cookie: [REDACTED]");
    assert.equal(sanitizeLogText(sanitizedCookies), sanitizedCookies);

    const inputKv = '{"studentId": "20110710001", "password": "mySecretPwd", "maSinhVien": 12345}';
    const sanitizedKv = sanitizeLogText(inputKv);
    assert.doesNotMatch(sanitizedKv, /mySecretPwd/);
    assert.doesNotMatch(sanitizedKv, /20110710001/);
    assert.equal(sanitizeLogText(sanitizedKv), sanitizedKv);

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("logger: formatMessage recursively redacts sensitive object keys, preserves safe keys", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uneti-logger-ctx-"));
    const loggerMod = await loadModule("app/utils/logger.js", {
        electron: { app: { getPath: () => tempDir } },
    });
    const { Logger, LOG_LEVELS } = loggerMod;
    const testLogger = new Logger({ logDir: tempDir });

    const context = {
        user: "test-student",
        password: "doNotLeakMe",
        nested: {
            studentId: "19107100001",
            maSinhVien: "19107100002",
            token: "tok-xyz",
            safeProperty: "public-data",
        },
        items: [
            { cookies: "ASP.NET_SessionId=val" },
            { name: "course-1", secret: "supersecret" },
        ],
    };

    const formatted = testLogger.formatMessage(LOG_LEVELS.INFO, "Processing login", context);

    assert.match(formatted, /test-student/);
    assert.match(formatted, /public-data/);
    assert.match(formatted, /course-1/);

    assert.doesNotMatch(formatted, /doNotLeakMe/);
    assert.doesNotMatch(formatted, /19107100001/);
    assert.doesNotMatch(formatted, /19107100002/);
    assert.doesNotMatch(formatted, /tok-xyz/);
    assert.doesNotMatch(formatted, /supersecret/);

    assert.match(formatted, /"password":"\[REDACTED\]"/);
    assert.match(formatted, /"studentId":"\[REDACTED\]"/);
    assert.match(formatted, /"token":"\[REDACTED\]"/);

    const circular = { id: 1 };
    circular.self = circular;
    const circularFormatted = testLogger.formatMessage(LOG_LEVELS.WARN, "Circular item", circular);
    assert.match(circularFormatted, /\[Circular\]/);

    await testLogger.close();
    await fs.rm(tempDir, { recursive: true, force: true });
});

test("logger: bounded rotation and async flush write to disk and prune old logs", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uneti-logger-rot-"));
    const loggerMod = await loadModule("app/utils/logger.js", {
        electron: { app: { getPath: () => tempDir } },
    });
    const { Logger, LOG_LEVELS } = loggerMod;

    const testLogger = new Logger({
        logDir: tempDir,
        maxFileSize: 250,
        maxTotalSize: 800,
        maxLogAgeMs: 1000,
    });

    await testLogger.initPromise;

    for (let i = 0; i < 15; i++) {
        testLogger.info(`Log message iteration ${i} with padding text to trigger rotation limit`);
    }
    await testLogger.flush();

    const files = await fs.readdir(tempDir);
    const logFiles = files.filter((f) => f.startsWith("app-") && f.endsWith(".log"));
    assert.ok(logFiles.length >= 2, "Should have rotated to multiple log files");

    const oldLogPath = path.join(tempDir, "app-2020-01-01.log");
    await fs.writeFile(oldLogPath, "old log content\n", "utf8");
    const oldTime = new Date(Date.now() - 5000);
    await fs.utimes(oldLogPath, oldTime, oldTime);

    await testLogger.cleanOldLogs();
    const remainingFiles = await fs.readdir(tempDir);
    assert.ok(!remainingFiles.includes("app-2020-01-01.log"), "Old log should be deleted");

    await testLogger.close();
    await fs.rm(tempDir, { recursive: true, force: true });
});

test("supportApi: rejects disallowed or non-HTTPS endpoints without network call", async () => {
    const dummyConfig = {
        HTTP_TIMEOUT_MS: 5000,
        UNETI_SCHEDULE_ENDPOINT: "https://apiv3.uneti.edu.vn/api/schedule",
        UNETI_EXAM_ENDPOINT: "https://apiv3.uneti.edu.vn/api/exam",
        UNETI_GRADES_ENDPOINT: "https://apiv3.uneti.edu.vn/api/grades",
        UNETI_GPA_ENDPOINT: "https://apiv3.uneti.edu.vn/api/gpa",
        UNETI_CURRICULUM_ENDPOINT: "https://apiv3.uneti.edu.vn/api/curriculum",
        UNETI_MAJOR_CURRICULUM_ENDPOINT: "https://apiv3.uneti.edu.vn/api/major",
    };

    let fetchCalled = false;
    const supportApiMod = await loadModule("app/fetcher/supportApi.js", {
        electron: {
            net: {
                fetch: async () => {
                    fetchCalled = true;
                    return { ok: true, status: 200, text: async () => "[]" };
                },
            },
        },
        "./cookieManager.js": { buildCookieHeader: async () => "token=valid" },
        "./sessionState.js": {
            createAuthError: (msg) => new Error(`AUTH_EXPIRED: ${msg}`),
            isAuthError: (err) => String(err?.message || "").includes("AUTH_EXPIRED"),
        },
        "../config.js": { CONFIG: dummyConfig },
        "../utils/logger.js": { logger: { error: () => {}, warn: () => {}, debug: () => {}, info: () => {} } },
    });

    const { callSupportApi } = supportApiMod;

    await assert.rejects(
        async () => {
            await callSupportApi({ endpoint: "http://apiv3.uneti.edu.vn/api/schedule" });
        },
        /Disallowed API endpoint/i
    );

    await assert.rejects(
        async () => {
            await callSupportApi({ endpoint: "https://attacker.com/api/schedule" });
        },
        /Disallowed API endpoint/i
    );

    await assert.rejects(
        async () => {
            await callSupportApi({ endpoint: "https://apiv3.uneti.edu.vn/api/unknown-endpoint" });
        },
        /Disallowed API endpoint/i
    );

    assert.equal(fetchCalled, false, "Fetch should not be called for disallowed endpoints");
});

test("supportApi: uses redirect:error, passes combined signal, and handles auth on 401", async () => {
    const dummyConfig = {
        HTTP_TIMEOUT_MS: 5000,
        UNETI_SCHEDULE_ENDPOINT: "https://apiv3.uneti.edu.vn/api/schedule",
    };

    let passedOptions = null;
    let returnStatus = 200;

    const supportApiMod = await loadModule("app/fetcher/supportApi.js", {
        electron: {
            net: {
                fetch: async (url, options) => {
                    passedOptions = options;
                    if (returnStatus === 401) {
                        return { ok: false, status: 401, text: async () => "unauthorized" };
                    }
                    return { ok: true, status: 200, text: async () => "[{\"id\":1}]" };
                },
            },
        },
        "./cookieManager.js": { buildCookieHeader: async () => "access_token=sample" },
        "./sessionState.js": {
            createAuthError: (msg) => {
                const err = new Error(msg);
                err.code = "AUTH_EXPIRED";
                return err;
            },
            isAuthError: (err) => err?.code === "AUTH_EXPIRED",
        },
        "../config.js": { CONFIG: dummyConfig },
        "../utils/logger.js": { logger: { error: () => {}, warn: () => {}, debug: () => {}, info: () => {} } },
    });

    const { callSupportApi } = supportApiMod;

    const userController = new AbortController();
    const res = await callSupportApi({
        endpoint: dummyConfig.UNETI_SCHEDULE_ENDPOINT,
        signal: userController.signal,
    });

    assert.deepEqual(JSON.parse(JSON.stringify(res)), [{ id: 1 }]);
    assert.equal(passedOptions.redirect, "error", "redirect option must be error");

    const resWithQuery = await callSupportApi({
        endpoint: `${dummyConfig.UNETI_SCHEDULE_ENDPOINT}?studentId=21107100001`,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(resWithQuery)), [{ id: 1 }]);
    assert.ok(passedOptions.signal, "AbortSignal must be provided");

    returnStatus = 401;
    await assert.rejects(
        async () => {
            await callSupportApi({ endpoint: dummyConfig.UNETI_SCHEDULE_ENDPOINT });
        },
        (err) => err?.code === "AUTH_EXPIRED"
    );
});

test("supportApi: avoids raw response text logging and validates array-body envelope", async () => {
    const dummyConfig = {
        HTTP_TIMEOUT_MS: 5000,
        UNETI_SCHEDULE_ENDPOINT: "https://apiv3.uneti.edu.vn/api/schedule",
    };

    const loggedErrors = [];
    let mockResponseBody = "";
    let mockResponseStatus = 500;
    let mockResponseOk = false;

    const supportApiMod = await loadModule("app/fetcher/supportApi.js", {
        electron: {
            net: {
                fetch: async () => ({
                    ok: mockResponseOk,
                    status: mockResponseStatus,
                    text: async () => mockResponseBody,
                }),
            },
        },
        "./cookieManager.js": { buildCookieHeader: async () => "access_token=sample" },
        "./sessionState.js": {
            createAuthError: (msg) => new Error(msg),
            isAuthError: () => false,
        },
        "../config.js": { CONFIG: dummyConfig },
        "../utils/logger.js": {
            logger: {
                error: (msg) => loggedErrors.push(String(msg)),
                warn: () => {},
                debug: () => {},
                info: () => {},
            },
        },
    });

    const { callSupportApi } = supportApiMod;

    mockResponseOk = false;
    mockResponseStatus = 500;
    mockResponseBody = "FATAL_LEAK_STUDENT_DATA_12345_SECRET_TOKEN";
    await assert.rejects(
        async () => {
            await callSupportApi({ endpoint: dummyConfig.UNETI_SCHEDULE_ENDPOINT });
        },
        /HTTP 500/
    );
    assert.ok(!loggedErrors.some((msg) => msg.includes("FATAL_LEAK_STUDENT_DATA")), "Raw error response body must not be logged");

    mockResponseOk = true;
    mockResponseStatus = 200;
    mockResponseBody = "<html>Not JSON</html>";
    await assert.rejects(
        async () => {
            await callSupportApi({ endpoint: dummyConfig.UNETI_SCHEDULE_ENDPOINT });
        },
        /Invalid JSON response/
    );

    mockResponseBody = JSON.stringify({ error: "No array here", code: 400 });
    await assert.rejects(
        async () => {
            await callSupportApi({ endpoint: dummyConfig.UNETI_SCHEDULE_ENDPOINT });
        },
        /Invalid response envelope/
    );

    mockResponseBody = JSON.stringify({ body: [{ semester: 1 }] });
    const envelopeRes = await callSupportApi({ endpoint: dummyConfig.UNETI_SCHEDULE_ENDPOINT });
    assert.deepEqual(JSON.parse(JSON.stringify(envelopeRes)), { body: [{ semester: 1 }] }, "Array-body envelope preserved");

    mockResponseOk = false;
    mockResponseStatus = 500;
    const errorUrl = `${dummyConfig.UNETI_SCHEDULE_ENDPOINT}?studentId=secret12345`;
    const failNetMod = await loadModule("app/fetcher/supportApi.js", {
        electron: {
            net: {
                fetch: async (url) => {
                    throw new Error(`Connection failed at ${url}`);
                },
            },
        },
        "./cookieManager.js": { buildCookieHeader: async () => "access_token=sample" },
        "./sessionState.js": {
            createAuthError: (msg) => new Error(msg),
            isAuthError: () => false,
        },
        "../config.js": { CONFIG: dummyConfig },
        "../utils/logger.js": {
            logger: {
                error: (msg) => loggedErrors.push(String(msg)),
                warn: () => {},
                debug: () => {},
                info: () => {},
            },
        },
    });

    await assert.rejects(
        async () => {
            await failNetMod.callSupportApi({ endpoint: errorUrl });
        },
        (err) => {
            assert.ok(!err.message.includes("secret12345"), "Rethrown error message must not leak query params");
            return true;
        }
    );
    assert.ok(!loggedErrors.some((msg) => msg.includes("secret12345")), "Logged network error must not leak studentId query param");
});
