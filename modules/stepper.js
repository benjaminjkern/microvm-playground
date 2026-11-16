import { runBrain, resetBrain } from "./AI.js";

/**
 * Stepping a brain one instruction at a time and saying what happened, for anything that shows a run in
 * slow motion: the terminal tracer (trace.js) and the web playground (web/playground.js) both draw what
 * this reports. Nothing here touches the terminal or the DOM.
 */

// Which argument positions each operation reads from data (used to highlight operands).
export const DATA_READS = {
    add: [0, 1], sub: [0, 1], mult: [0, 1], div: [0, 1], exp: [0, 1],
    min: [0, 1], max: [0, 1],
    neg: [0], sqrt: [0], sin: [0], cos: [0], log: [0], floor: [0], ceil: [0],
    move: [0], jgz: [0], writeOutput: [0],
};

/** A value the way the tracers print it: six significant figures, no trailing zeros. */
export const formatValue = (v) =>
    typeof v === "number" && Number.isFinite(v)
        ? String(+v.toPrecision(6))
        : String(v);

export const instructionText = (ins) => [ins.opName, ...ins.args].join(" ");

/**
 * What the next instruction will read: the data cells (a set of indices) and the input slot (-1 for
 * none). Nothing once the run has finished.
 */
export const nextReads = ({ brain, finished }) => {
    const next = brain.instructions[brain.instructionPointer];
    if (finished || !next) return { data: new Set(), input: -1 };
    return {
        data: new Set((DATA_READS[next.opName] || []).map((k) => next.args[k])),
        input: next.opName === "readInput" ? next.args[0] : -1,
    };
};

/**
 * A stepper for one brain.
 * @param {Brain} brain The brain to step. It is reset here and by every `start`, and run in place.
 * @param {Object} [options]
 * @param {Function} [options.target] The function the brain is meant to compute; used in the summary.
 * @param {Function} [options.error] error(expected, result) used in the summary. Default: absolute difference.
 * @param {Number} [options.steps=100] Steps a run may take. Should match how the brain is scored.
 * @param {Boolean} [options.wrap=false] Wrap to the top after the last instruction instead of ending, as `runBrain`.
 * @param {Number} [options.inputIndex=0] Input slot that receives x.
 * @param {Number} [options.outputIndex=0] Output slot treated as the answer.
 * @returns {{ view, start, step }} `view` is the state to draw: `brain`, `opts`, `x` (undefined until a
 *   run starts), `step`, `finished`, `lastIp`, `written` (keys like "d3" and "o0" for what the last step
 *   changed), `event` (the last step in words) and `status` (the summary once the run is over).
 *   `start(x)` begins a fresh run on input x. `step()` executes one instruction and returns whether it
 *   did: false before a run has started and after it has finished.
 */
export const newStepper = (brain, options = {}) => {
    const opts = {
        error: (expected, result) => Math.abs(expected - result),
        steps: 100,
        wrap: false,
        inputIndex: 0,
        outputIndex: 0,
        ...options,
    };
    resetBrain(brain);
    const view = {
        brain, opts, x: undefined, step: 0, finished: false, lastIp: null,
        written: new Set(), event: "", status: "",
    };

    const start = (x) => {
        resetBrain(brain);
        brain.inputData[opts.inputIndex] = x;
        Object.assign(view, {
            x, step: 0, finished: false, lastIp: null, written: new Set(),
            event: "", status: "fresh run: brain reset, input loaded",
        });
    };

    const step = () => {
        if (view.x === undefined || view.finished) return false;
        const ip = brain.instructionPointer;
        const ins = brain.instructions[ip];
        const before = { data: [...brain.data], out: [...brain.outputData] };
        runBrain(brain, 1, opts.wrap);
        view.step++;
        view.lastIp = ip;
        view.written = new Set();
        const changes = [];
        brain.data.forEach((v, i) => {
            if (!Object.is(v, before.data[i])) {
                view.written.add(`d${i}`);
                changes.push(`data[${i}] = ${formatValue(v)}`);
            }
        });
        brain.outputData.forEach((v, i) => {
            if (!Object.is(v, before.out[i])) {
                view.written.add(`o${i}`);
                changes.push(`output[${i}] = ${formatValue(v)}`);
            }
        });
        const length = brain.instructions.length;
        const nextInLine = opts.wrap ? (ip + 1) % length : ip + 1;
        const ended = !opts.wrap && brain.instructionPointer >= length;
        if (brain.instructionPointer !== nextInLine) changes.push(`jump -> ${brain.instructionPointer}`);
        else if (ins.opName === "jgz") changes.push("not taken");
        if (ins.opName === "halt") changes.push("HALT");
        else if (ended) changes.push("END OF PROGRAM");
        view.event = `step ${view.step}: ${ip}: ${instructionText(ins)}   ${changes.join(", ") || "(no change)"}`;
        view.status = "";
        if (ins.opName === "halt" || ended || view.step >= opts.steps) {
            view.finished = true;
            const out = brain.outputData[opts.outputIndex];
            let summary = `finished after ${view.step} step(s): output[${opts.outputIndex}] = ${formatValue(out)}`;
            if (opts.target) {
                const expected = opts.target(view.x);
                summary += `, expected ${formatValue(expected)}, error ${formatValue(opts.error(expected, out))}`;
            }
            view.status = summary;
        }
        return true;
    };

    return { view, start, step };
};
