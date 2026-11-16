const http = require("http");
const fs = require("fs");
const path = require("path");

/**
 * The web side of the evolution harness (test/testAI.js starts it). One plain Node http server that
 *   - serves the repo as static files, so the frontend in web/ can import the same modules/ the harness runs;
 *   - reports on the run in progress: GET /api/state once, GET /api/events as a stream (server-sent events);
 *   - lists the saved brains (GET /api/brains; the files themselves are static, under /brains/) and saves
 *     one (PUT /api/brains/<name>.txt, the text as the body, ?overwrite=1 to replace an existing file);
 *   - passes on the two things the frontend can ask of the run: POST /api/reset and POST /api/save-best.
 *
 * It listens on this machine only and answers only to its own address, and it writes nowhere but the
 * brains folder, and there only text that `checkBrain` accepts under a plain file name.
 */

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
};
const BRAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.txt$/;
const MAX_BODY = 1 << 20;
const PORTS_TO_TRY = 10;

const fail = (status, message) => Object.assign(new Error(message), { status });

const readBody = (request) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(fail(413, "Too much to save in one go"));
                request.destroy();
            } else chunks.push(chunk);
        });
        request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        request.on("error", reject);
    });

/**
 * Start the server.
 * @param {Object} options
 * @param {Number} [options.port=8000] First port to try; the next few are tried if it is taken.
 * @param {String} options.root Folder served as static files (the repo).
 * @param {String} options.brainsDir Folder the saved brains live in.
 * @param {Function} options.getState Returns the run's current state, a plain object, for the frontend.
 * @param {Function} options.checkBrain Throws, with a message for the user, if a text is not a brain.
 * @param {Function} options.reset Restarts the population.
 * @param {Function} options.saveBest Writes the current best to the brains folder; returns the file's name.
 * @param {Number} [options.pushInterval=500] Milliseconds between states sent down /api/events.
 * @returns {Promise<{ port, url, close }|null>} null if no port could be had.
 */
const startServer = async ({
    port = 8000,
    root,
    brainsDir,
    getState,
    checkBrain,
    reset,
    saveBest,
    pushInterval = 500,
}) => {
    root = path.resolve(root);
    const listeners = new Set();
    let hosts = new Set();

    const send = (response, status, body, headers = {}) => {
        response.writeHead(status, { "Cache-Control": "no-store", ...headers });
        response.end(body);
    };
    const json = (response, status, value) =>
        send(response, status, JSON.stringify(value), {
            "Content-Type": "application/json",
        });

    const listBrains = () =>
        !fs.existsSync(brainsDir)
            ? []
            : fs
                  .readdirSync(brainsDir)
                  .filter((name) => BRAIN_NAME.test(name))
                  .map((name) => ({
                      name,
                      modified: fs.statSync(path.join(brainsDir, name)).mtimeMs,
                  }))
                  .sort((a, b) => b.modified - a.modified);

    const serveFile = (request, response, pathname) => {
        let decoded;
        try {
            decoded = decodeURIComponent(pathname);
        } catch {
            throw fail(400, "Bad path");
        }
        const segments = decoded.split("/").filter(Boolean);
        // no dotfiles (.git and friends), and with them no ".." out of the root
        if (segments.some((segment) => segment.startsWith(".")))
            throw fail(404, "Not found");
        let file = path.join(root, ...segments);
        if (!fs.existsSync(file)) throw fail(404, "Not found");
        if (fs.statSync(file).isDirectory()) {
            if (!pathname.endsWith("/"))
                return send(response, 302, "", { Location: `${pathname}/` });
            file = path.join(file, "index.html");
            if (!fs.existsSync(file)) throw fail(404, "Not found");
        }
        send(response, 200, request.method === "HEAD" ? "" : fs.readFileSync(file), {
            "Content-Type":
                TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        });
    };

    const saveBrain = async (request, response, url) => {
        let name;
        try {
            name = decodeURIComponent(url.pathname.slice("/api/brains/".length));
        } catch {
            throw fail(400, "Bad name");
        }
        if (!BRAIN_NAME.test(name))
            throw fail(
                400,
                "A brain's name is letters, digits, dots, dashes and underscores, ending in .txt",
            );
        const text = await readBody(request);
        try {
            checkBrain(text);
        } catch (error) {
            throw fail(400, String(error?.message ?? error));
        }
        const file = path.join(brainsDir, name);
        if (fs.existsSync(file) && url.searchParams.get("overwrite") !== "1")
            throw fail(409, `${name} already exists`);
        fs.mkdirSync(brainsDir, { recursive: true });
        fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
        json(response, 200, { name });
    };

    const handle = async (request, response) => {
        // Only our own address: a page on some other site that points a host name at 127.0.0.1 gets nothing.
        if (!hosts.has(request.headers.host)) throw fail(403, "Not this server's address");
        const url = new URL(request.url, `http://${request.headers.host}`);
        const reading = request.method === "GET" || request.method === "HEAD";
        if (!reading) {
            const origin = request.headers.origin;
            if (origin && !hosts.has(new URL(origin).host))
                throw fail(403, "Not from this server's own pages");
        }
        const route = `${request.method} ${url.pathname}`;
        if (route === "GET /") return send(response, 302, "", { Location: "/web/" });
        if (route === "GET /api/state") return json(response, 200, getState());
        if (route === "GET /api/brains") return json(response, 200, listBrains());
        if (route === "GET /api/events") {
            response.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-store",
                Connection: "keep-alive",
            });
            response.write(`data: ${JSON.stringify(getState())}\n\n`);
            listeners.add(response);
            request.on("close", () => listeners.delete(response));
            return;
        }
        if (request.method === "PUT" && url.pathname.startsWith("/api/brains/"))
            return saveBrain(request, response, url);
        if (route === "POST /api/reset") {
            reset();
            return json(response, 200, getState());
        }
        if (route === "POST /api/save-best")
            return json(response, 200, { name: saveBest() });
        if (url.pathname.startsWith("/api/")) throw fail(404, "No such endpoint");
        if (!reading) throw fail(405, "Read only");
        return serveFile(request, response, url.pathname);
    };

    const server = http.createServer((request, response) => {
        handle(request, response).catch((error) => {
            if (response.headersSent) return response.end();
            json(response, error.status ?? 500, {
                error: error.status ? error.message : "Something went wrong in the server",
            });
            if (!error.status) console.error(error);
        });
    });

    const listen = (candidate) =>
        new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(candidate, "127.0.0.1", () => {
                server.off("error", reject);
                resolve(candidate);
            });
        });
    let bound = null;
    for (let candidate = port; candidate < port + PORTS_TO_TRY; candidate++) {
        try {
            bound = await listen(candidate);
            break;
        } catch (error) {
            if (error.code !== "EADDRINUSE") throw error;
        }
    }
    if (bound === null) return null;
    hosts = new Set([`localhost:${bound}`, `127.0.0.1:${bound}`]);

    const push = setInterval(() => {
        if (listeners.size === 0) return;
        const message = `data: ${JSON.stringify(getState())}\n\n`;
        for (const listener of listeners) listener.write(message);
    }, pushInterval);
    push.unref();

    return {
        port: bound,
        url: `http://localhost:${bound}/`,
        close: () => {
            clearInterval(push);
            for (const listener of listeners) listener.end();
            server.close();
            server.closeAllConnections?.();
        },
    };
};

module.exports = { startServer };
