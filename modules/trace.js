import { runBrain, resetBrain } from "./AI.js";

/**
 * Interactive terminal tracer for a brain (Node only; safe to import in the browser, never call it there).
 * Draws the program, data, input and output once and redraws them in place as the brain executes,
 * with a moving instruction pointer and highlighted reads/writes.
 *
 * Keys: Enter/Space = step, 1-9 = n steps, r = run (any key pauses), a = restart same input,
 * n = new input, q/Esc/Ctrl-C = quit. When stdin is piped, one command per line.
 */

// Which argument positions each operation reads from data (used to highlight operands).
const DATA_READS = {
    add: [0, 1], sub: [0, 1], mult: [0, 1], div: [0, 1], exp: [0, 1],
    min: [0, 1], max: [0, 1],
    neg: [0], sqrt: [0], sin: [0], cos: [0], log: [0], floor: [0], ceil: [0],
    move: [0], jgz: [0], writeOutput: [0],
};

const fmt = (v) =>
    typeof v === "number" && Number.isFinite(v)
        ? String(+v.toPrecision(6))
        : String(v);

const ANSI = {
    reset: "\x1b[0m", inverse: "\x1b[7m", green: "\x1b[1;32m", cyan: "\x1b[36m",
    magenta: "\x1b[35m", home: "\x1b[H", clearScreen: "\x1b[2J", clearBelow: "\x1b[J",
    clearLine: "\x1b[K", hideCursor: "\x1b[?25l", showCursor: "\x1b[?25h",
};
const paint = (text, color) => (color ? color + text + ANSI.reset : text);
const instructionText = (ins) => [ins.opName, ...ins.args].join(" ");

// Lay out {text, color} cells column-major (read down, then across) in fixed-width columns.
const columnize = (cells, colWidth, termWidth) => {
    const columns = Math.max(1, Math.min(cells.length, Math.floor((termWidth - 1) / colWidth)));
    const rows = Math.ceil(cells.length / columns);
    const lines = [];
    for (let r = 0; r < rows; r++) {
        let line = "";
        for (let c = 0; c < columns; c++) {
            const cell = cells[r + c * rows];
            if (cell) line += paint(cell.text.padEnd(colWidth), cell.color);
        }
        lines.push(line);
    }
    return lines;
};

const indexedCells = (arr, colorFor) =>
    arr.map((v, i) => ({ text: `${String(i).padStart(2)}: ${fmt(v)}`, color: colorFor(i) }));

// Draw the whole frame over the previous one.
const renderTrace = (view) => {
    const { brain, opts, x, step, finished, lastIp, written, event, status, promptLine } = view;
    const width = process.stdout.columns || 100;
    const nextIp = brain.instructionPointer;
    const next = brain.instructions[nextIp];
    const readIdx = new Set(
        finished ? [] : (DATA_READS[next.opName] || []).map((k) => next.args[k]),
    );
    const readsInput = !finished && next.opName === "readInput" ? next.args[0] : -1;
    const lines = [];

    lines.push(
        [
            paint(" MicroVM trace ", ANSI.inverse),
            brain.score !== undefined ? `score ${fmt(brain.score)}` : "",
            x === undefined
                ? ""
                : `x = ${fmt(x)}` + (opts.target ? `   expected f(x) = ${fmt(opts.target(x))}` : ""),
            x === undefined ? "" : `step ${step}/${opts.steps}`,
        ].filter(Boolean).join("   "),
    );

    const instrWidth = Math.max(...brain.instructions.map((ins) => instructionText(ins).length));
    const progCells = brain.instructions.map((ins, i) => {
        const isNext = !finished && i === nextIp;
        const isLast = i === lastIp;
        const marker = isNext ? ">" : isLast ? "*" : " ";
        return {
            text: `${marker} ${String(i).padStart(2)}: ${instructionText(ins).padEnd(instrWidth)}`,
            color: isNext ? ANSI.inverse : isLast ? ANSI.magenta : null,
        };
    });
    lines.push(`Program   ${paint(" > next ", ANSI.inverse)}  ${paint("* last executed", ANSI.magenta)}`);
    lines.push(...columnize(progCells, instrWidth + 8, width));
    lines.push("");

    lines.push(`Data      ${paint("written by last step", ANSI.green)}  ${paint("read by next", ANSI.cyan)}`);
    lines.push(
        ...columnize(
            indexedCells(brain.data, (i) =>
                written.has(`d${i}`) ? ANSI.green : readIdx.has(i) ? ANSI.cyan : null,
            ),
            18,
            width,
        ),
    );
    lines.push("");

    const row = (label, cells) => label.padEnd(10) + columnize(cells, 18, width).join("\n          ");
    lines.push(row("Input", indexedCells(brain.inputData, (i) => (i === readsInput ? ANSI.cyan : null))));
    lines.push(row("Output", indexedCells(brain.outputData, (i) => (written.has(`o${i}`) ? ANSI.green : null))));
    lines.push(`Last      ${event || "-"}`);
    lines.push(`          ${status || ""}`);
    lines.push("");
    lines.push(promptLine);

    process.stdout.write(
        ANSI.home + lines.map((l) => l + ANSI.clearLine).join("\n") + "\n" + ANSI.clearBelow,
    );
};

// Keypress input in a terminal (raw mode); line input when stdin is piped. null means EOF/Ctrl-C.
const createInput = (readline) => {
    const queue = [];
    const waiting = [];
    let closed = false;
    const push = (item) => (waiting.length ? waiting.shift()(item) : queue.push(item));
    const tty = Boolean(process.stdin.isTTY && process.stdin.setRawMode);
    let rl;
    if (tty) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("keypress", (str, key) => {
            if (key && key.ctrl && (key.name === "c" || key.name === "d")) return push(null);
            push({ str: str || "", name: (key && key.name) || "" });
        });
    } else {
        rl = readline.createInterface({ input: process.stdin, terminal: false });
        rl.on("line", (line) => push(line));
        rl.on("close", () => {
            closed = true;
            while (waiting.length) waiting.shift()(null);
        });
    }
    return {
        tty,
        pending: () => queue.length > 0,
        next: () =>
            new Promise((resolve) => {
                if (queue.length) return resolve(queue.shift());
                if (closed) return resolve(null);
                waiting.push(resolve);
            }),
        close: () => {
            if (tty) {
                process.stdin.setRawMode(false);
                process.stdin.pause();
            } else rl.close();
        },
    };
};

// One command: "step", a step count, "run", "again", "new", "quit", or null to ignore.
const readCommand = async (input) => {
    const k = await input.next();
    if (k === null) return "quit";
    let s;
    if (input.tty) s = k.name === "return" || k.name === "space" ? "" : k.str;
    else s = k.trim();
    if (s === "") return "step";
    if (/^\d+$/.test(s) && Number(s) > 0) return Number(s);
    if (s === "r") return "run";
    if (s === "a") return "again";
    if (s === "n") return "new";
    if (s === "q") return "quit";
    return null;
};

// A line of text (the input x), redrawing the frame as it is typed in raw mode.
const readLine = async (input, view, promptText) => {
    if (!input.tty) {
        renderTrace({ ...view, promptLine: promptText });
        const line = await input.next();
        return line === null ? null : line.trim();
    }
    let buf = "";
    while (true) {
        renderTrace({ ...view, promptLine: promptText + buf + "_" });
        const k = await input.next();
        if (k === null || k.name === "escape") return null;
        if (k.name === "return") return buf.trim();
        if (k.name === "backspace") buf = buf.slice(0, -1);
        else if (/^[\x20-\x7e]$/.test(k.str)) buf += k.str;
    }
};

/**
 * Interactively trace a brain in the terminal: pick an input, then watch it execute step by step.
 * @param {Brain} brain The brain to trace (it is reset for every run).
 * @param {Object} [options]
 * @param {Function} [options.target] The function the brain is meant to compute; shown as expected output.
 * @param {Function} [options.error] error(expected, result) used in the summary. Default: absolute difference.
 * @param {Number} [options.steps=100] Steps per run. Should match how the brain is scored.
 * @param {Number} [options.inputIndex=0] Input slot that receives x.
 * @param {Number} [options.outputIndex=0] Output slot treated as the answer.
 */
export const traceBrain = async (brain, options = {}) => {
    const opts = {
        error: (expected, result) => Math.abs(expected - result),
        steps: 100,
        inputIndex: 0,
        outputIndex: 0,
        ...options,
    };
    const readline = (await import("node:readline")).default;
    const input = createInput(readline);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const restore = () => process.stdout.write(ANSI.showCursor);
    process.on("exit", restore);
    process.stdout.write(ANSI.clearScreen + ANSI.home + ANSI.hideCursor);

    const HELP = "[Enter/Space] step   [1-9] n steps   [r] run   [a] restart   [n] new input   [q] quit";
    const HELP_DONE = "[a] restart   [n] new input   [q] quit";

    resetBrain(brain);
    const view = {
        brain, opts, x: undefined, step: 0, finished: false, lastIp: null,
        written: new Set(), event: "", status: "", promptLine: "",
    };

    const startRun = (x) => {
        resetBrain(brain);
        brain.inputData[opts.inputIndex] = x;
        Object.assign(view, {
            x, step: 0, finished: false, lastIp: null, written: new Set(),
            event: "", status: "fresh run: brain reset, input loaded",
        });
    };

    const doStep = () => {
        const ip = brain.instructionPointer;
        const ins = brain.instructions[ip];
        const before = { data: [...brain.data], out: [...brain.outputData] };
        runBrain(brain, 1);
        view.step++;
        view.lastIp = ip;
        view.written = new Set();
        const changes = [];
        brain.data.forEach((v, i) => {
            if (!Object.is(v, before.data[i])) {
                view.written.add(`d${i}`);
                changes.push(`data[${i}] = ${fmt(v)}`);
            }
        });
        brain.outputData.forEach((v, i) => {
            if (!Object.is(v, before.out[i])) {
                view.written.add(`o${i}`);
                changes.push(`output[${i}] = ${fmt(v)}`);
            }
        });
        const nextInLine = (ip + 1) % brain.sizes.INSTRUCTIONS;
        if (brain.instructionPointer !== nextInLine) changes.push(`jump -> ${brain.instructionPointer}`);
        else if (ins.opName === "jgz") changes.push("not taken");
        if (ins.opName === "halt") changes.push("HALT");
        view.event = `step ${view.step}: ${ip}: ${instructionText(ins)}   ${changes.join(", ") || "(no change)"}`;
        view.status = "";
        if (ins.opName === "halt" || view.step >= opts.steps) {
            view.finished = true;
            const out = brain.outputData[opts.outputIndex];
            let summary = `finished after ${view.step} step(s): output[${opts.outputIndex}] = ${fmt(out)}`;
            if (opts.target) {
                const expected = opts.target(view.x);
                summary += `, expected ${fmt(expected)}, error ${fmt(opts.error(expected, out))}`;
            }
            view.status = summary;
        }
    };

    try {
        input: while (true) {
            const s = await readLine(input, view, "Input x (q to quit): ");
            if (s === null || s === "q" || s === "") break;
            const x = Number(s);
            if (Number.isNaN(x)) {
                view.status = `"${s}" is not a number`;
                continue;
            }
            startRun(x);
            while (true) {
                renderTrace({ ...view, promptLine: view.finished ? HELP_DONE : HELP });
                const cmd = await readCommand(input);
                if (cmd === null) continue;
                if (cmd === "quit") break input;
                if (cmd === "new") continue input;
                if (cmd === "again") {
                    startRun(x);
                    continue;
                }
                if (view.finished) continue;
                if (cmd === "run") {
                    while (!view.finished && !(input.tty && input.pending())) {
                        doStep();
                        renderTrace({ ...view, promptLine: HELP + "   (running, any key pauses)" });
                        await sleep(60);
                    }
                } else {
                    const count = cmd === "step" ? 1 : cmd;
                    for (let i = 0; i < count && !view.finished; i++) doStep();
                }
            }
        }
    } finally {
        input.close();
        restore();
        process.stdout.write("\n");
    }
};
