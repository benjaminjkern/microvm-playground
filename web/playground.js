import {
    newStepper,
    nextReads,
    formatValue as fmt,
    instructionText,
} from "../modules/stepper.js";
import * as edit from "../modules/brainFile.js";

/**
 * The playground: a brain run one instruction at a time, the terminal tracer (modules/trace.js) in the
 * browser, on the same stepper. Give it an input, then step, run or restart, and watch the pointer move
 * and the data change. When the brain is editable every instruction, argument and start value is a form
 * control: an edit changes the brain in place, the run in progress is replayed to the step it was on, and
 * `onEdit` tells the page.
 */

const KIND_TITLES = {
    DATASIZE: "data cell",
    INSTRUCTIONS: "instruction",
    INPUTSIZE: "input slot",
    OUTPUTSIZE: "output slot",
};
const RUN_INTERVAL = 60; // milliseconds per step while running, as the terminal tracer

const h = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === false || value === null || value === undefined) continue;
        if (key === "class") node.className = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? "" : value);
    }
    node.append(...children.filter((child) => child !== null && child !== undefined));
    return node;
};

/**
 * @param {HTMLElement} root Where the playground is built.
 * @param {Object} [callbacks]
 * @param {Function} [callbacks.onEdit] Called after every edit to the brain.
 * @param {Function} [callbacks.onStart] Called with x when a run starts or restarts.
 * @returns {{ show, configure, start }}
 */
export const newPlayground = (root, { onEdit, onStart } = {}) => {
    let brain = null;
    let editable = false;
    let options = { target: undefined, cap: 100 };
    let stepper = null;
    // The run the user has asked for: its input, and how many steps they have taken it. Kept apart from
    // the stepper because an edit can end the run early (a halt, say); the step they were on is still
    // where they want to be once the program runs that far again.
    let run = { x: undefined, wanted: 0 };
    let running = null; // the interval while "Run" is going
    let notice = ""; // a refusal or a mistake to show in place of the run's status

    const button = (label, onclick, props = {}) =>
        h("button", { type: "button", onclick, ...props }, label);

    const xInput = h("input", { type: "number", step: "any", value: "1", class: "x", "aria-label": "Input x" });
    const startButton = button("Start", () => startFromInput());
    const stepButton = button("Step", () => stepBy(1));
    const tenButton = button("10 steps", () => stepBy(10));
    const runButton = button("Run", () => toggleRun());
    const restartButton = button("Restart", () => begin(run.x));
    const headline = h("div", { class: "headline" });
    const program = h("div", { class: "program" });
    const startCells = h("div", { class: "cells editing" });
    const startSection = h("section", {},
        h("h3", {}, "Start values ", h("small", {}, "what the data cells and the output hold before a run")),
        startCells);
    const dataCells = h("div", { class: "cells" });
    const io = h("div", { class: "cells io" });
    const last = h("div", { class: "last" });
    const status = h("div", { class: "run-status" });
    const body = h("div", { class: "playground-body" },
        h("div", { class: "run-controls" },
            h("label", {}, "x ", xInput),
            startButton, stepButton, tenButton, runButton, restartButton,
            h("small", {}, "r runs or pauses, a restarts")),
        headline,
        h("section", {},
            h("h3", {}, "Program ",
                h("small", {}, h("span", { class: "legend next" }, "▶ next"), " ", h("span", { class: "legend lastrun" }, "● last executed"))),
            program),
        startSection,
        h("section", {},
            h("h3", {}, "Data ",
                h("small", {}, h("span", { class: "legend written" }, "written by last step"), " ", h("span", { class: "legend read" }, "read by next"))),
            dataCells),
        io,
        h("div", { class: "last-row" }, h("span", { class: "index" }, "Last"), last),
        status);
    const empty = h("div", { class: "playground-empty" }, "No brain to play with.");
    root.replaceChildren(empty, body);
    xInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") startFromInput();
    });
    root.addEventListener("keydown", (event) => {
        if (!stepper || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target.closest("input, select, textarea")) return;
        if (event.key === "r") toggleRun();
        else if (event.key === "a" && run.x !== undefined) begin(run.x);
    });

    const stepperOptions = () => ({ target: options.target, steps: options.cap });
    const stopRunning = () => {
        if (running === null) return;
        clearInterval(running);
        running = null;
    };

    // A fresh stepper on the brain as it is now, taken as far into the run as the user had gone.
    const replay = () => {
        stepper = newStepper(brain, stepperOptions());
        if (run.x === undefined) return;
        stepper.start(run.x);
        for (let i = 0; i < run.wanted && stepper.step(); i++);
    };
    const took = () => {
        run.wanted = stepper.view.step;
    };

    // ---- drawing ---------------------------------------------------------------------------------------

    const focusOn = (key) => root.querySelector(`[data-key="${key}"]`)?.focus();
    const refuse = (message) => {
        notice = message;
        updateRun();
    };

    // The edit has been made: replay the run, redraw what changed, and tell the page.
    const changed = (rebuild, focusKey) => {
        notice = "";
        replay();
        if (rebuild) {
            renderProgram();
            renderStartValues();
            if (focusKey) focusOn(focusKey);
        }
        updateMarkers();
        updateRun();
        onEdit?.();
    };

    const valid = (input, ok) => {
        input.classList.toggle("invalid", !ok);
        return ok;
    };

    const argInput = (k, i, kind) => {
        const max = brain.sizes[kind] - 1;
        return h("input", {
            type: "number", class: "arg", min: 0, max, step: 1,
            value: brain.instructions[k].args[i],
            title: `${KIND_TITLES[kind] ?? "index"}, 0 to ${max}`,
            "aria-label": `Instruction ${k}, argument ${i + 1}: ${KIND_TITLES[kind] ?? "index"}`,
            dataset: { key: `arg-${k}-${i}` },
            oninput: (event) => {
                const value = Number(event.target.value);
                const ok = event.target.value.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= max;
                if (!valid(event.target, ok)) return;
                const args = [...brain.instructions[k].args];
                args[i] = value;
                edit.setInstruction(brain, k, brain.instructions[k].opName, args);
                changed(false);
            },
        });
    };

    const renderProgram = () => {
        const count = brain.instructions.length;
        program.classList.toggle("editing", editable);
        program.replaceChildren(
            ...brain.instructions.map((ins, k) => {
                const row = h("div", { class: "ins", dataset: { k } },
                    h("span", { class: "marker" }),
                    h("span", { class: "index" }, `${k}:`));
                if (!editable) {
                    row.append(h("span", { class: "text" }, instructionText(ins)));
                    return row;
                }
                const select = h("select", {
                    class: "op", "aria-label": `Instruction ${k}: operation`, dataset: { key: `op-${k}` },
                    onchange: (event) => {
                        edit.setInstruction(brain, k, event.target.value);
                        changed(true, `op-${k}`);
                    },
                }, ...Object.keys(brain.operations).map((name) => h("option", { value: name }, name)));
                select.value = ins.opName;
                row.append(
                    select,
                    h("span", { class: "args" },
                        ...edit.argKinds(brain, ins.opName).map((kind, i) => argInput(k, i, kind))),
                    h("span", { class: "row-actions" },
                        button("↑", () => {
                            edit.moveInstruction(brain, k, k - 1);
                            changed(true, `up-${Math.max(0, k - 1)}`);
                        }, { class: "mini", title: "Move up", disabled: k === 0, dataset: { key: `up-${k}` } }),
                        button("↓", () => {
                            edit.moveInstruction(brain, k, k + 1);
                            changed(true, `down-${Math.min(count - 1, k + 1)}`);
                        }, { class: "mini", title: "Move down", disabled: k === count - 1, dataset: { key: `down-${k}` } }),
                        button("+", () => {
                            if (!edit.insertInstruction(brain, k + 1))
                                return refuse("A brain holds at most 32 instructions.");
                            changed(true, `op-${k + 1}`);
                        }, { class: "mini", title: "Insert an instruction below", dataset: { key: `insert-${k}` } }),
                        button("×", () => {
                            edit.removeInstruction(brain, k);
                            changed(true, `remove-${Math.min(k, count - 2)}`);
                        }, { class: "mini", title: "Remove", disabled: count === 1, dataset: { key: `remove-${k}` } })));
                return row;
            }),
        );
    };

    const startValue = (label, key, value, set, ...extra) =>
        h("span", { class: "cell" },
            h("span", { class: "index" }, label),
            h("input", {
                type: "number", step: "any", value, "aria-label": `Start value of ${label}`, dataset: { key },
                oninput: (event) => {
                    const number = Number(event.target.value);
                    if (!valid(event.target, event.target.value.trim() !== "" && Number.isFinite(number))) return;
                    set(number);
                    changed(false);
                },
            }),
            ...extra);

    const renderStartValues = () => {
        startSection.hidden = !editable;
        if (!editable) return;
        const count = brain.startData.length;
        startCells.replaceChildren(
            ...brain.startData.map((value, k) =>
                startValue(`${k}:`, `data-${k}`, value, (number) => edit.setStartData(brain, k, number),
                    button("×", () => {
                        edit.removeData(brain, k);
                        changed(true, `data-${Math.min(k, count - 2)}`);
                    }, { class: "mini", title: `Remove data cell ${k}`, disabled: count === 1 }))),
            button("+ cell", () => {
                if (!edit.addData(brain)) return refuse("A brain holds at most 32 data cells.");
                changed(true, `data-${brain.startData.length - 1}`);
            }, { class: "add", dataset: { key: "data-add" } }),
            ...brain.startOutputData.map((value, k) =>
                startValue(`output ${k}:`, `output-${k}`, value, (number) => edit.setStartOutput(brain, k, number))),
        );
    };

    const updateMarkers = () => {
        const { finished, lastIp } = stepper.view;
        const nextIp = finished ? -1 : brain.instructionPointer;
        for (const row of program.children) {
            const k = Number(row.dataset.k);
            row.classList.toggle("next", k === nextIp);
            row.classList.toggle("lastrun", k === lastIp && k !== nextIp);
            row.firstChild.textContent = k === nextIp ? "▶" : k === lastIp ? "●" : "";
        }
    };

    const cell = (label, value, state) =>
        h("span", { class: `cell${state ? ` ${state}` : ""}` }, h("span", { class: "index" }, label), ` ${fmt(value)}`);

    const updateRun = () => {
        const view = stepper.view;
        const reads = nextReads(view);
        const started = view.x !== undefined;
        dataCells.replaceChildren(
            ...brain.data.map((value, i) =>
                cell(`${i}:`, value, view.written.has(`d${i}`) ? "written" : reads.data.has(i) ? "read" : "")),
        );
        io.replaceChildren(
            ...brain.inputData.map((value, i) => cell(`Input ${i}:`, value, reads.input === i ? "read" : "")),
            ...brain.outputData.map((value, i) => cell(`Output ${i}:`, value, view.written.has(`o${i}`) ? "written" : "")),
        );
        if (!started) headline.textContent = "Give an input x and press Start, or click a point on the graph.";
        else {
            let expected = "";
            try {
                if (options.target) expected = `   expected f(x) = ${fmt(options.target(view.x))}`;
            } catch {
                // a target that throws just goes unshown
            }
            headline.textContent = `x = ${fmt(view.x)}${expected}   step ${view.step} of at most ${options.cap}`;
        }
        last.textContent = view.event || "–";
        status.textContent = notice || view.status;
        status.classList.toggle("notice", Boolean(notice));
        stepButton.disabled = tenButton.disabled = runButton.disabled = view.finished;
        runButton.textContent = running === null ? "Run" : "Pause";
        restartButton.disabled = !started;
    };

    // ---- running ---------------------------------------------------------------------------------------

    const begin = (x) => {
        stopRunning();
        notice = "";
        run = { x, wanted: 0 };
        stepper.start(x);
        updateMarkers();
        updateRun();
        onStart?.(x);
    };
    const startFromInput = () => {
        if (!stepper) return false;
        const x = Number(xInput.value);
        if (xInput.value.trim() === "" || !Number.isFinite(x)) {
            refuse("x has to be a number.");
            return false;
        }
        begin(x);
        return true;
    };
    const ensureStarted = () => Boolean(stepper) && (stepper.view.x !== undefined || startFromInput());
    const stepBy = (count) => {
        if (!ensureStarted()) return;
        stopRunning();
        notice = "";
        for (let i = 0; i < count && stepper.step(); i++);
        took();
        updateMarkers();
        updateRun();
    };
    const toggleRun = () => {
        if (running !== null) {
            stopRunning();
            return updateRun();
        }
        if (!ensureStarted() || stepper.view.finished) return;
        notice = "";
        running = setInterval(() => {
            if (!stepper.step() || stepper.view.finished) stopRunning();
            took();
            updateMarkers();
            updateRun();
        }, RUN_INTERVAL);
        updateRun();
    };

    // ---- what the page calls ---------------------------------------------------------------------------

    /**
     * Show a brain. It is stepped in place, and edited in place when `editable`.
     * @param {Brain|null} newBrain
     * @param {Object} [how] `editable`, `target` (a function, for the expected value), `cap` (steps a run
     *   may take) and `keepRun`: carry the run in progress over to this brain, for when it is the same
     *   brain in a new version.
     */
    const show = (newBrain, { editable: canEdit = false, target, cap = 100, keepRun = false } = {}) => {
        stopRunning();
        if (!keepRun) run = { x: undefined, wanted: 0 };
        brain = newBrain;
        editable = canEdit;
        options = { target, cap };
        notice = "";
        empty.hidden = Boolean(brain);
        body.hidden = !brain;
        if (!brain) {
            stepper = null;
            return;
        }
        replay();
        renderProgram();
        renderStartValues();
        updateMarkers();
        updateRun();
    };

    /** The target or the step cap changed: the run in progress is replayed under the new ones. */
    const configure = ({ target, cap }) => {
        options = { target, cap };
        if (!stepper) return;
        stopRunning();
        replay();
        updateMarkers();
        updateRun();
    };

    /** Start a run on input x, as if it had been typed in. */
    const start = (x) => {
        if (!stepper) return;
        xInput.value = String(x);
        begin(x);
    };

    show(null);
    return { show, configure, start };
};
