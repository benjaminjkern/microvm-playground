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
const MAX_DATASIZE = 32;
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
    sin: {
        run:
            ([x, p]) =>
            (brain) => {
                brain.data[p] = Math.sin(brain.data[x]);
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
    cos: {
        run:
            ([x, p]) =>
            (brain) => {
                brain.data[p] = Math.cos(brain.data[x]);
            },
        argSizes: ["DATASIZE", "DATASIZE"],
    },
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
export const newBrainFromString = (brainString, operations = {}, sizes = {}) => {
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

/**
 * Rewrite every instruction argument of one kind ("INSTRUCTIONS" or "DATASIZE") through `mapIndex`,
 * then rebuild each `run` closure, since `run` captured the old arguments when the instruction was created.
 */
const remapReferences = (brain, sizeName, mapIndex) => {
    brain.instructions = brain.instructions.map(({ opName, args }) => {
        const operation = brain.operations[opName];
        const argSizes = operation.argSizes ?? [];
        const newArgs = args.map((a, i) =>
            argSizes[i] === sizeName ? mapIndex(a) : a,
        );
        return { opName, args: newArgs, run: operation.run(newArgs) };
    });
};

// Index maps for a structural change at position k.
// Insert: references keep pointing at the element they pointed at before.
// Duplicate: references to k are split at random between the two copies.
// Remove: references to k go to the neighbour that slides into its slot (or the new last element).
const afterInsert = (k) => (i) => (i < k ? i : i + 1);
const afterDuplicate = (k) => (i) =>
    i < k ? i : i > k ? i + 1 : k + Math.floor(Math.random() * 2);
const afterRemove = (k, newLength) => (i) =>
    i < k ? i : i > k ? i - 1 : Math.min(k, newLength - 1);

/**
 * Structural mutations. Each changes the brain in place: the array, its size, and every instruction
 * argument that refers to a moved element. `k` is the position to act on (for inserts it may equal the
 * current length, meaning append). Each returns whether it applied; size limits can refuse it.
 */
export const STRUCTURAL_MUTATIONS = {
    insertInstruction: (brain, k) => {
        if (brain.instructions.length >= MAX_INSTRUCTIONS) return false;
        brain.instructions.splice(
            k,
            0,
            randomInstruction(brain.sizes, brain.operations),
        );
        brain.sizes.INSTRUCTIONS = brain.instructions.length;
        remapReferences(brain, "INSTRUCTIONS", afterInsert(k));
        return true;
    },
    duplicateInstruction: (brain, k) => {
        if (brain.instructions.length >= MAX_INSTRUCTIONS) return false;
        brain.instructions.splice(k, 0, copyInstruction(brain.instructions[k]));
        brain.sizes.INSTRUCTIONS = brain.instructions.length;
        remapReferences(brain, "INSTRUCTIONS", afterDuplicate(k));
        return true;
    },
    removeInstruction: (brain, k) => {
        if (brain.instructions.length <= 1) return false;
        brain.instructions.splice(k, 1);
        brain.sizes.INSTRUCTIONS = brain.instructions.length;
        remapReferences(
            brain,
            "INSTRUCTIONS",
            afterRemove(k, brain.instructions.length),
        );
        return true;
    },
    insertData: (brain, k) => {
        if (brain.startData.length >= MAX_DATASIZE) return false;
        brain.startData.splice(k, 0, randomGaussian());
        brain.sizes.DATASIZE = brain.startData.length;
        remapReferences(brain, "DATASIZE", afterInsert(k));
        return true;
    },
    duplicateData: (brain, k) => {
        if (brain.startData.length >= MAX_DATASIZE) return false;
        brain.startData.splice(k, 0, brain.startData[k]);
        brain.sizes.DATASIZE = brain.startData.length;
        remapReferences(brain, "DATASIZE", afterDuplicate(k));
        return true;
    },
    removeData: (brain, k) => {
        if (brain.startData.length <= 1) return false;
        brain.startData.splice(k, 1);
        brain.sizes.DATASIZE = brain.startData.length;
        remapReferences(brain, "DATASIZE", afterRemove(k, brain.startData.length));
        return true;
    },
};

/**
 * Take in an existing brain and return a mutated copy. The parent is never modified.
 * @param {Brain} brain
 * @param {Number} dataMutationRate Every start and output value gets a gaussian nudge scaled by this.
 * @param {Number} instructionMutationRate Probability that each instruction is replaced by a random one.
 * @param {Number} structureMutationRate Probability that the child also gets one structural change,
 *      picked at random from `STRUCTURAL_MUTATIONS`: insert, duplicate or remove an instruction or a data cell.
 *      Arguments that refer to moved instructions or cells are rewritten so they keep pointing at the same thing.
 * @returns {Brain} A brand new mutated brain, ready to run.
 */
export const mutateBrain = (
    brain,
    dataMutationRate = 0.1,
    instructionMutationRate = 0.1,
    structureMutationRate = 0.1,
) => {
    const child = {
        instructions: brain.instructions.map((ins) =>
            Math.random() < instructionMutationRate
                ? randomInstruction(brain.sizes, brain.operations)
                : copyInstruction(ins),
        ),
        sizes: { ...brain.sizes },
        operations: brain.operations,
        startData: brain.startData.map(
            (d) => d + dataMutationRate * randomGaussian(),
        ),
        startOutputData: brain.startOutputData.map(
            (d) => d + dataMutationRate * randomGaussian(),
        ),
    };

    if (Math.random() < structureMutationRate) {
        const names = Object.keys(STRUCTURAL_MUTATIONS);
        const name = names[Math.floor(Math.random() * names.length)];
        const length = name.endsWith("Data")
            ? child.startData.length
            : child.instructions.length;
        const positions = name.startsWith("insert") ? length + 1 : length;
        STRUCTURAL_MUTATIONS[name](child, Math.floor(Math.random() * positions));
    }

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
 * Run a brain for a specified number of steps, stopping early at a `halt`.
 * @param {Brain} brain
 * @param {Number} steps
 * @returns {Number} The number of steps actually executed.
 */
export const runBrain = (brain, steps = 1) => {
    for (let s = 0; s < steps; s++) {
        const result = brain.instructions[brain.instructionPointer].run(brain);
        brain.instructionPointer =
            (brain.instructionPointer + 1) % brain.sizes["INSTRUCTIONS"];
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

export { traceBrain } from "./trace.js";
