import { randomGaussian } from "./utils.js";

/**
 * The default argument sizes. Technically you can overwrite these to be whatever you want or even add new ones,
 * as long as the operations refer to a correct number listed here, both in their `run` method and in their `argSizes`.
 *
 * There is really no need to do this though.
 *
 * The default refers to an io space, a data space, and the number of instructions to include.
 */

const MAX_INSTRUCTIONS = 32;
const DEFAULT_SIZES = {
    INPUTSIZE: 16,
    OUTPUTSIZE: 16,
    DATASIZE: 32,
    INSTRUCTIONS: MAX_INSTRUCTIONS,
};

/**
 * The default operations. Feel free to add ones as you wish, passed in by the `newBrain` method.
 * I am not documenting how these works as I'm hoping it's relatively straightforward and follow a simple enough pattern.
 */
const DEFAULT_OPERATIONS = {
    add: {
        run:
            ([x, y, p]) =>
            (brain) => {
                brain.data[p] = brain.data[x] + brain.data[y];
            },
        argSizes: ["DATASIZE", "DATASIZE", "DATASIZE"],
    },
    sub: {
        run:
            ([x, y, p]) =>
            (brain) => {
                brain.data[p] = brain.data[x] - brain.data[y];
            },
        argSizes: ["DATASIZE", "DATASIZE", "DATASIZE"],
    },
    mult: {
        run:
            ([x, y, p]) =>
            (brain) => {
                brain.data[p] = brain.data[x] * brain.data[y];
            },
        argSizes: ["DATASIZE", "DATASIZE", "DATASIZE"],
    },
    div: {
        run:
            ([x, y, p]) =>
            (brain) => {
                brain.data[p] = brain.data[x] / brain.data[y];
            },
        argSizes: ["DATASIZE", "DATASIZE", "DATASIZE"],
    },
    exp: {
        run:
            ([x, y, p]) =>
            (brain) => {
                brain.data[p] = brain.data[x] ** brain.data[y];
            },
        argSizes: ["DATASIZE", "DATASIZE", "DATASIZE"],
    },
    neg: {
        run:
            ([x, p]) =>
            (brain) => {
                brain.data[p] = -brain.data[x];
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
    sqrt: {
        run:
            ([x, p]) =>
            (brain) => {
                brain.data[p] = Math.sqrt(brain.data[x]);
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
    // sin: {
    //     run:
    //         ([x, p]) =>
    //         (brain) => {
    //             brain.data[p] = Math.sin(brain.data[x]);
    //         },
    //     argSizes: ["DATASIZE", "DATASIZE"],
    // },
    // cos: {
    //     run:
    //         ([x, p]) =>
    //         (brain) => {
    //             brain.data[p] = Math.cos(brain.data[x]);
    //         },
    //     argSizes: ["DATASIZE", "DATASIZE"],
    // },
    log: {
        run:
            ([x, p]) =>
            (brain) => {
                brain.data[p] = Math.log(brain.data[x]);
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
    floor: {
        run:
            ([x, p]) =>
            (brain) => {
                brain.data[p] = Math.floor(brain.data[x]);
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
    ceil: {
        run:
            ([x, p]) =>
            (brain) => {
                brain.data[p] = Math.ceil(brain.data[x]);
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
    min: {
        run:
            ([x, y, p]) =>
            (brain) => {
                brain.data[p] = Math.min(brain.data[x], brain.data[y]);
            },
        argSizes: ["DATASIZE", "DATASIZE", "DATASIZE"],
    },
    max: {
        run:
            ([x, y, p]) =>
            (brain) => {
                brain.data[p] = Math.max(brain.data[x], brain.data[y]);
            },
        argSizes: ["DATASIZE", "DATASIZE", "DATASIZE"],
    },
    jump: {
        run:
            ([i]) =>
            (brain) => {
                brain.instructionPointer = i - 1;
            },
        argSizes: ["INSTRUCTIONS"],
    },
    jgz: {
        run:
            ([x, i]) =>
            (brain) => {
                if (brain.data[x] > 0) brain.instructionPointer = i - 1;
            },
        argSizes: ["DATASIZE", "INSTRUCTIONS"],
    },
    set0: {
        run:
            ([x]) =>
            (brain) => {
                brain.data[x] = 0;
            },
        argSizes: ["DATASIZE"],
    },
    set1: {
        run:
            ([x]) =>
            (brain) => {
                brain.data[x] = 1;
            },
        argSizes: ["DATASIZE"],
    },
    setrandom: {
        run:
            ([x]) =>
            (brain) => {
                brain.data[x] = Math.random();
            },
        argSizes: ["DATASIZE"],
    },
    move: {
        run:
            ([x, y]) =>
            (brain) => {
                brain.data[y] = brain.data[x];
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
    readInput: {
        run:
            ([q, p]) =>
            (brain) => {
                brain.data[p] = brain.inputData[q];
            },
        argSizes: ["INPUTSIZE", "DATASIZE"],
    },
    writeOutput: {
        run:
            ([p, q]) =>
            (brain) => {
                brain.outputData[q] = brain.data[p];
            },
        argSizes: ["DATASIZE", "OUTPUTSIZE"],
    },
    nop: {
        run: () => () => {},
    },
    halt: {
        run: () => () => ({
            halt: true,
        }),
    },
};

/**
 * Generate a random instruction from the list of sizes and operations.
 * This should not be called directly, as it also takes steps to generate the `run` methods of each operation and track them.
 * @param {Object} sizes The list of sizes. See `DEFAULT_SIZES`.
 * @param {Object} operations The list of operations. See `DEFAULT_OPERATIONS`
 * @returns {Instruction} A new instruction, selected with randomized arguments as well as some tracers so that we can print out the brain later.
 */
const randomInstruction = (sizes, operations) => {
    const opNames = Object.keys(operations);
    const opName = opNames[Math.floor(Math.random() * opNames.length)];
    const operation = operations[opName];

    const args = (operation.argSizes ?? []).map((size) =>
        Math.floor(Math.random() * sizes[size]),
    );

    return { run: operation.run(args), opName, args };
};

/**
 * Rebuild a brain from the output of `brainToString`.
 * The string carries no input size, so INPUTSIZE defaults to `DEFAULT_SIZES.INPUTSIZE` unless given in `sizes`.
 * @param {String} brainString Output of `brainToString`.
 * @param {Object} operations Optional operations to add to or overwrite the defaults.
 * @param {Object} sizes Optional sizes, e.g. { INPUTSIZE: 1 }. Output, data and instruction sizes come from the string.
 */
export const newBrainFromString = (
    brainString,
    operations = {},
    sizes = {},
) => {
    const [instructions, startData, startOutputData] = brainString
        .split("\n")
        .map((line) => line.split(","));

    const newSizes = {
        INPUTSIZE: DEFAULT_SIZES.INPUTSIZE,
        ...sizes,
        OUTPUTSIZE: startOutputData.length,
        DATASIZE: startData.length,
        INSTRUCTIONS: instructions.length,
    };
    const newOperations = { ...DEFAULT_OPERATIONS, ...operations };

    startData.forEach((x, i) => (startData[i] = +x));
    startOutputData.forEach((x, i) => (startOutputData[i] = +x));

    instructions.forEach((instruction, i) => {
        const [opName, ...args] = instruction.split(" ");
        if (!newOperations[opName]) throw `Unknown operation: ${opName}`;

        args.forEach((arg, i) => (args[i] = +arg));
        instructions[i] = {
            run: newOperations[opName].run(args),
            opName,
            args,
        };
    });
    return {
        instructions,
        sizes: newSizes,
        operations: newOperations,

        startData,
        startOutputData,

        inputData: Array(newSizes["INPUTSIZE"]).fill(0),
        data: [...startData],
        outputData: [...startOutputData],
        instructionPointer: 0,
    };
};

/**
 * Generate a new brain.
 * @param {Object} sizes Optional parameter to change the default sizes of the parameters. Can also add new sizes, if need be.
 * @param {Object} operations Optional parameter to overwrite or add to the default operations.
 * @returns {Brain} A brand new randomized brain, ready to run.
 */
export const newBrain = (sizes = {}, operations = {}) => {
    const newSizes = { ...DEFAULT_SIZES, ...sizes };
    const newOperations = { ...DEFAULT_OPERATIONS, ...operations };

    const startData = Array(newSizes["DATASIZE"]).fill().map(randomGaussian);
    const startOutputData = Array(newSizes["OUTPUTSIZE"])
        .fill()
        .map(randomGaussian);

    return {
        instructions: Array(newSizes["INSTRUCTIONS"])
            .fill()
            .map(() => randomInstruction(newSizes, newOperations)),
        sizes: newSizes,
        operations: newOperations,

        startData,
        startOutputData,

        inputData: Array(newSizes["INPUTSIZE"]).fill(0),
        data: [...startData],
        outputData: [...startOutputData],
        instructionPointer: 0,
    };
};

const copyInstruction = (ins) => ({
    opName: ins.opName,
    args: [...ins.args],
    run: ins.run,
});

const nopInstruction = (operations) => ({
    opName: "nop",
    args: [],
    run: operations.nop.run([]),
});

// The first slot at or after k holding a nop, or the slot count when there is none.
const nextNop = (brain, k) => {
    const m = brain.instructions.findIndex(
        (ins, i) => i >= k && ins.opName === "nop",
    );
    return m === -1 ? brain.instructions.length : m;
};

/**
 * Structural mutations on a fixed set of slots. Slots are addresses, so none of these changes the slot
 * count: an insert or duplicate at `k` shifts the slots from `k` down as far as the nearest nop, which it
 * consumes (with no nop after `k`, the last slot falls off); a remove shifts the slots after `k` up as far
 * as the nearest nop and leaves a nop at the end of the shifted stretch (or in the last slot); a move takes
 * slot `k` to slot `j`, shifting the slots between. Nothing beyond the nearest nop moves, and jump targets
 * follow the instructions they point at, so a shift on its own never changes what a program does (a
 * removed instruction's targets go to the one that slides into its slot). All take `(brain, k, j)`,
 * ignoring `j` unless they need it, and return whether they changed anything.
 */
// Rewrite every instruction-address argument through `mapIndex`, rebuilding `run` where one changed,
// so jump targets keep pointing at the instruction they pointed at after it has been shifted.
const remapTargets = (brain, mapIndex) => {
    brain.instructions = brain.instructions.map((ins) => {
        const operation = brain.operations[ins.opName];
        const argSizes = operation.argSizes ?? [];
        const args = ins.args.map((a, i) =>
            argSizes[i] === "INSTRUCTIONS" ? mapIndex(a) : a,
        );
        return args.every((a, i) => a === ins.args[i])
            ? ins
            : { opName: ins.opName, args, run: operation.run(args) };
    });
};

const insertAt = (brain, k, instruction) => {
    const consumed = Math.min(nextNop(brain, k), brain.instructions.length - 1);
    brain.instructions.splice(consumed, 1);
    brain.instructions.splice(k, 0, instruction);
    remapTargets(brain, (i) => (i >= k && i < consumed ? i + 1 : i));
    return true;
};

export const STRUCTURAL_MUTATIONS = {
    insert: (brain, k) =>
        insertAt(brain, k, randomInstruction(brain.sizes, brain.operations)),
    duplicate: (brain, k) => {
        if (brain.instructions[k].opName === "nop") return false;
        return insertAt(brain, k, copyInstruction(brain.instructions[k]));
    },
    remove: (brain, k) => {
        if (brain.instructions[k].opName === "nop") return false;
        const m = nextNop(brain, k + 1);
        brain.instructions.splice(k, 1);
        brain.instructions.splice(m - 1, 0, nopInstruction(brain.operations));
        remapTargets(brain, (i) => (i > k && i < m ? i - 1 : i));
        return true;
    },
    move: (brain, k, j) => {
        if (k === j || brain.instructions.length < 2) return false;
        const [instruction] = brain.instructions.splice(k, 1);
        brain.instructions.splice(j, 0, instruction);
        remapTargets(brain, (i) =>
            i === k
                ? j
                : k < j && i > k && i <= j
                  ? i - 1
                  : j < k && i >= j && i < k
                    ? i + 1
                    : i,
        );
        return true;
    },
};
const STRUCTURAL_NAMES = Object.keys(STRUCTURAL_MUTATIONS);

// Replace instruction n with a copy whose arguments went through `mapArgs`, rebuilding `run`.
const rewireInstruction = (brain, n, mapArgs) => {
    const ins = brain.instructions[n];
    const args = mapArgs(ins.args);
    brain.instructions[n] = { opName: ins.opName, args, run: brain.operations[ins.opName].run(args) };
};
const dataArgs = (brain, ins) =>
    (brain.operations[ins.opName].argSizes ?? []).map((kind) => kind === "DATASIZE");

/**
 * Wiring mutations on data cells; the cells themselves never move. A merge points every reference to
 * cell `k` at cell `j` instead, so whatever is computed into one is seen by the users of the other; a
 * split takes one of several references to `k` and points it at an unused cell holding a copy of `k`'s
 * start value, so the two can go their own ways. Both take `(brain, k, j)` and return whether they
 * changed anything.
 */
export const WIRING_MUTATIONS = {
    merge: (brain, k, j) => {
        if (k === j) return false;
        let changed = false;
        brain.instructions.forEach((ins, n) => {
            const isData = dataArgs(brain, ins);
            if (!ins.args.some((a, i) => isData[i] && a === k)) return;
            changed = true;
            rewireInstruction(brain, n, (args) =>
                args.map((a, i) => (isData[i] && a === k ? j : a)),
            );
        });
        return changed;
    },
    split: (brain, k) => {
        const used = new Set();
        const refs = [];
        brain.instructions.forEach((ins, n) =>
            dataArgs(brain, ins).forEach((isData, i) => {
                if (!isData) return;
                used.add(ins.args[i]);
                if (ins.args[i] === k) refs.push([n, i]);
            }),
        );
        const free = brain.startData.map((_, c) => c).filter((c) => !used.has(c));
        if (refs.length < 2 || free.length === 0) return false;
        const [n, i] = refs[Math.floor(Math.random() * refs.length)];
        const u = free[Math.floor(Math.random() * free.length)];
        brain.startData[u] = brain.startData[k];
        rewireInstruction(brain, n, (args) => args.map((a, idx) => (idx === i ? u : a)));
        return true;
    },
};
const WIRING_NAMES = Object.keys(WIRING_MUTATIONS);

/**
 * How much of a brain is in use: the instructions that are not `nop`, and the distinct data cells those
 * instructions refer to. The sizes themselves never change, so this is what "a smaller brain" means.
 * @returns {{ instructions: Number, data: Number }}
 */
export const brainSize = (brain) => {
    const used = brain.instructions.filter(({ opName }) => opName !== "nop");
    const cells = new Set();
    used.forEach(({ opName, args }) =>
        (brain.operations[opName].argSizes ?? []).forEach((kind, i) => {
            if (kind === "DATASIZE") cells.add(args[i]);
        }),
    );
    return { instructions: used.length, data: cells.size };
};

/**
 * Take in an existing brain and return a mutated copy. The parent is never modified. Every rate is per
 * element, so a child's expected number of changes of each kind is the rate times the number of slots.
 * @param {Brain} brain
 * @param {Number} dataMutationRate Every start and output value gets a gaussian nudge scaled by this.
 * @param {Number} instructionMutationRate Probability that each instruction is replaced by a random one.
 * @param {Number} structureMutationRate Probability, per instruction slot, of one structural change picked
 *      at random from `STRUCTURAL_MUTATIONS` (insert, duplicate, remove or move, all within the fixed slots),
 *      and per data cell of one wiring change from `WIRING_MUTATIONS` (merge or split its references).
 * @param {Number} dataRoundingRate Probability that each start-data cell is rounded to the nearest integer,
 *      so exact integer constants are reachable without being built out of set1 and add.
 * @param {Number} argumentMutationRate Probability that each argument of a kept instruction is redrawn on
 *      its own, so an instruction can be rewired to another cell or target without being replaced.
 * @returns {Brain} A brand new mutated brain, ready to run.
 */
export const mutateBrain = (
    brain,
    dataMutationRate = 0.1,
    instructionMutationRate = 0.1,
    structureMutationRate = 0,
    dataRoundingRate = 0,
    argumentMutationRate = 0,
) => {
    const round = (d) => (Math.random() < dataRoundingRate ? Math.round(d) : d);
    const rewire = (ins) => {
        const operation = brain.operations[ins.opName];
        const argSizes = operation.argSizes ?? [];
        let changed = false;
        const args = ins.args.map((a, i) => {
            if (Math.random() >= argumentMutationRate) return a;
            changed = true;
            return Math.floor(Math.random() * brain.sizes[argSizes[i]]);
        });
        return changed
            ? { opName: ins.opName, args, run: operation.run(args) }
            : copyInstruction(ins);
    };
    const child = {
        instructions: brain.instructions.map((ins) =>
            Math.random() < instructionMutationRate
                ? randomInstruction(brain.sizes, brain.operations)
                : rewire(ins),
        ),
        sizes: { ...brain.sizes },
        operations: brain.operations,
        startData: brain.startData.map((d) =>
            round(d + dataMutationRate * randomGaussian()),
        ),
        startOutputData: brain.startOutputData.map(
            (d) => d + dataMutationRate * randomGaussian(),
        ),
    };

    // Every instruction slot rolls for a structural change and every data cell for a wiring change. The
    // hits are counted first and then applied one at a time at freshly drawn positions, since each one
    // can shift or rewire the others.
    const applyHits = (count, mutations, names) => {
        let hits = 0;
        for (let i = 0; i < count; i++)
            if (Math.random() < structureMutationRate) hits++;
        for (; hits > 0; hits--) {
            const name = names[Math.floor(Math.random() * names.length)];
            const k = Math.floor(Math.random() * count);
            const j = (k + 1 + Math.floor(Math.random() * (count - 1))) % count;
            mutations[name](child, k, j);
        }
    };
    applyHits(child.instructions.length, STRUCTURAL_MUTATIONS, STRUCTURAL_NAMES);
    applyHits(child.startData.length, WIRING_MUTATIONS, WIRING_NAMES);

    resetBrain(child);
    return child;
};

/**
 * Homologous uniform crossover: a child that takes each instruction and each start-data (and output)
 * value from one parent or the other at the same slot, chosen at random per slot. Neither parent is
 * modified, and the child is not mutated; pass it to `mutateBrain` for that.
 * @param {Brain} a
 * @param {Brain} b A brain with the same sizes and operations.
 * @returns {Brain} A brand new brain, ready to run.
 */
export const crossoverBrains = (a, b) => {
    if (
        a.instructions.length !== b.instructions.length ||
        a.startData.length !== b.startData.length ||
        a.startOutputData.length !== b.startOutputData.length
    )
        throw new Error("crossoverBrains needs two brains of the same sizes");
    const pick = (field, copy) =>
        a[field].map((value, i) =>
            copy(Math.random() < 0.5 ? value : b[field][i]),
        );
    const child = {
        instructions: pick("instructions", copyInstruction),
        sizes: { ...a.sizes },
        operations: a.operations,
        startData: pick("startData", (d) => d),
        startOutputData: pick("startOutputData", (d) => d),
    };
    resetBrain(child);
    return child;
};

/**
 * Reset a brain back to "factory" settings, as if it was just created.
 * Specifically, this sets all input data to be 0, and all start and output data to be how they were when the brain was created.
 * @param {Brain} brain The brain to reset
 */
export const resetBrain = (brain) => {
    brain.inputData = Array(brain.sizes["INPUTSIZE"]).fill(0);
    brain.data = [...brain.startData];
    brain.outputData = [...brain.startOutputData];
    brain.instructionPointer = 0;
};

/**
 * Run a brain for up to `steps` steps. The run ends early at a `halt`, or when the pointer runs off the
 * end of the program; a program that wants to keep going loops back with `jump` or `jgz`. With `wrap`
 * the pointer goes back to the top instead, which is how the game's bots run on across frames. A brain
 * that has ended stays ended, executing nothing, until `resetBrain`.
 * @param {Brain} brain
 * @param {Number} steps
 * @param {Boolean} wrap Continue from the first instruction after the last one instead of ending.
 * @returns {Number} The number of steps actually executed.
 */
export const runBrain = (brain, steps = 1, wrap = false) => {
    const length = brain.instructions.length;
    for (let s = 0; s < steps; s++) {
        if (brain.instructionPointer >= length) return s;
        const result = brain.instructions[brain.instructionPointer].run(brain);
        brain.instructionPointer++;
        if (wrap) brain.instructionPointer %= length;
        if (typeof result === "object" && result.halt) return s + 1;
    }
    return steps;
};

/**
 * Print out to console all data associated with the brain. This includes:
 * - A list of instructions with associated arguments, highlighted on where the instruction pointer currently is. (Top left)
 * - The internal data. (Top right)
 * - The input data. (Bottom left)
 * - The output data. (Bottom right)
 * @param {Brain} brain The brain to print
 */
export const printBrain = (brain, asStart = true, columns = 4) => {
    if (typeof process !== "undefined" && process) {
        process.stdout.cursorTo(0, 0);
        process.stdout.clearScreenDown();
    }
    // process.stdout.moveTo(0);
    // process.stdout.clearScreenDown();
    printInColumns(
        brain.instructions,
        columns,
        brain.instructions.length,
        (x) => [x.opName, ...x.args].join(" "),
    );
    console.log("");
    printInColumns(brain.startOutputData, columns);
    console.log("");
    printInColumns(brain.startData, columns);
    console.log("");
    // for (let i = 0; i < brain.sizes["IOSIZE"]; i += 2) {
    //     console.log(
    //         fillToSpace(`${i}: ` + brain.inputData[i]),
    //         fillToSpace(`${i + 1}: ` + brain.inputData[i + 1]),
    //         "|",
    //         fillToSpace(`${i}: ` + brain.outputData[i]),
    //         fillToSpace(`${i + 1}: ` + brain.outputData[i + 1])
    //     );
    // }
};

const printInColumns = (
    array,
    columns,
    arrayLength = array.length,
    mapFunc,
) => {
    const columnSize = Math.ceil(arrayLength / columns);
    for (let i = 0; i < columnSize; i += 1) {
        console.log(
            Array(columns)
                .fill()
                .map((_, j) => {
                    const index = i + j * columnSize;
                    if (index >= arrayLength) return "";
                    return fillToSpace(
                        `${index}: ` +
                            (mapFunc ? mapFunc(array[index]) : array[index]),
                    );
                })
                .join(""),
        );
    }
};

const fillToSpace = (string, length = 28) => {
    return (
        string +
        Array(length - (string + "").length)
            .fill(" ")
            .join("")
    );
};

const colorit = (hascolor, string) => {
    if (hascolor) return `*${string}`;
    // return `\x1b[43m${string}\x1b[0m`;
    return string;
};

/**
 * Print out the full brain as a string for use later.
 * @param {Brain} brain The brain to print
 * @returns {String} The brain in string form
 */
export const brainToString = (brain) => {
    return `${brain.instructions
        .map(({ opName, args }) => [opName, ...args].join(" "))
        .join(",")}\n${brain.startData.join(",")}\n${brain.startOutputData.join(
        ",",
    )}`;
};

export { traceBrain, createInput } from "./trace.js";
