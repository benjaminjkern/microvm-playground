import {
    newBrainFromString,
    brainToString,
    resetBrain,
    STRUCTURAL_MUTATIONS,
} from "./AI.js";

/**
 * Saved brains as files and as things to edit by hand: reading one together with its notes, checking it
 * is a program the VM can actually run, writing it back out, and the edits the web playground offers.
 * Shared by the server (which checks what it is asked to save) and the browser. No Node, no DOM.
 *
 * A brain file is what `brainToString` prints (instructions, start data, start output: three lines) with
 * any number of `#` note lines around it.
 */

const KINDS = {
    DATASIZE: "a data cell",
    INSTRUCTIONS: "an instruction",
    INPUTSIZE: "an input",
    OUTPUTSIZE: "an output",
};

/** What each argument of an operation refers to: a list of size names such as "DATASIZE". */
export const argKinds = (brain, opName) =>
    brain.operations[opName]?.argSizes ?? [];

// Throws with a message a person can act on if the brain would misbehave in the VM: an argument that
// points outside the program or the data reads `undefined` there and quietly turns everything to NaN.
const check = (brain) => {
    brain.instructions.forEach(({ opName, args }, k) => {
        const kinds = argKinds(brain, opName);
        const where = `Instruction ${k} (${[opName, ...args].join(" ")})`;
        if (args.length !== kinds.length)
            throw new Error(
                `${where} takes ${kinds.length} argument${kinds.length === 1 ? "" : "s"}, not ${args.length}`,
            );
        args.forEach((arg, i) => {
            const size = brain.sizes[kinds[i]];
            if (!Number.isInteger(arg) || arg < 0 || arg >= size)
                throw new Error(
                    `${where}: argument ${i + 1} has to be ${KINDS[kinds[i]] ?? "an index"} from 0 to ${size - 1}`,
                );
        });
    });
    for (const [name, values] of [
        ["Start data", brain.startData],
        ["Start output", brain.startOutputData],
    ])
        values.forEach((value, i) => {
            if (!Number.isFinite(value))
                throw new Error(`${name} ${i} is not a number`);
        });
};

/**
 * Read a brain file.
 * @param {String} text The file's contents.
 * @param {Object} [sizes] Sizes the text does not carry; the function harness uses one input.
 * @returns {{ notes: String[], brain: Brain }} The note lines without their `#`, and the brain, reset.
 * @throws {Error} If the text is not a brain the VM can run, saying what is wrong.
 */
export const parseBrainFile = (text, sizes = { INPUTSIZE: 1 }) => {
    const lines = text.split("\n").map((line) => line.trim());
    const notes = lines
        .filter((line) => line.startsWith("#"))
        .map((line) => line.replace(/^#\s?/, ""));
    const body = lines.filter((line) => line && !line.startsWith("#"));
    if (body.length !== 3)
        throw new Error(
            `A brain is three lines (instructions, start data, start output); found ${body.length}`,
        );
    let brain;
    try {
        brain = newBrainFromString(text, {}, sizes);
    } catch (error) {
        // newBrainFromString throws a bare string for an unknown operation
        throw new Error(String(error?.message ?? error));
    }
    check(brain);
    return { notes, brain };
};

/** The text of a brain file: the notes as `#` lines, then the brain. */
export const formatBrainFile = (notes, brain) =>
    [
        ...notes.map((note) => (note ? `# ${note}` : "#")),
        brainToString(brain),
        "",
    ].join("\n");

// ---- edits ---------------------------------------------------------------------------------------------
// Each changes the brain in place and leaves it reset, ready to run. The ones that can be refused (the VM
// caps a brain at 32 instructions and 32 data cells, and it needs at least one of each) return whether
// they applied. Arguments that refer to instructions or data cells that move are rewritten to follow them.

const clampIndex = (value, size) =>
    Math.min(size - 1, Math.max(0, Math.floor(Number(value)) || 0));

/**
 * Make instruction `k` the operation `opName`. `args` may be left out, or be shorter than the operation
 * needs: each missing argument keeps the old instruction's value when it referred to the same kind of
 * thing, and is 0 otherwise. Every argument is clamped into range.
 */
export const setInstruction = (brain, k, opName, args = []) => {
    const operation = brain.operations[opName];
    if (!operation) throw new Error(`Unknown operation: ${opName}`);
    const kinds = operation.argSizes ?? [];
    const old = brain.instructions[k];
    const oldKinds = old ? argKinds(brain, old.opName) : [];
    const clean = kinds.map((kind, i) =>
        clampIndex(
            args[i] ?? (oldKinds[i] === kind ? old.args[i] : 0),
            brain.sizes[kind],
        ),
    );
    brain.instructions[k] = { opName, args: clean, run: operation.run(clean) };
    resetBrain(brain);
};

/** Put a do-nothing `move 0 0` at position `k` (the current length appends). */
export const insertInstruction = (brain, k) => {
    if (!STRUCTURAL_MUTATIONS.insertInstruction(brain, k)) return false;
    // the VM's own insert puts a random instruction there
    if (brain.operations.move) setInstruction(brain, k, "move", [0, 0]);
    resetBrain(brain);
    return true;
};

export const removeInstruction = (brain, k) => {
    const applied = STRUCTURAL_MUTATIONS.removeInstruction(brain, k);
    resetBrain(brain);
    return applied;
};

/** Move instruction `k` to position `j`; everything in between slides one slot towards `k`. */
export const moveInstruction = (brain, k, j) => {
    if (j < 0 || j >= brain.instructions.length) return false;
    const applied = STRUCTURAL_MUTATIONS.moveInstruction(brain, k, j);
    resetBrain(brain);
    return applied;
};

/** Add a data cell holding 0 at the end. */
export const addData = (brain) => {
    const k = brain.startData.length;
    if (!STRUCTURAL_MUTATIONS.insertData(brain, k)) return false;
    brain.startData[k] = 0;
    resetBrain(brain);
    return true;
};

export const removeData = (brain, k) => {
    const applied = STRUCTURAL_MUTATIONS.removeData(brain, k);
    resetBrain(brain);
    return applied;
};

export const setStartData = (brain, k, value) => {
    brain.startData[k] = value;
    resetBrain(brain);
};

export const setStartOutput = (brain, k, value) => {
    brain.startOutputData[k] = value;
    resetBrain(brain);
};
