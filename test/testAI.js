const {
    newBrain,
    printBrainInstructions,
    runBrain,
    mutateBrain,
    resetBrain,
    printBrain,
    traceBrain,
    createInput,
    brainToString,
} = require("../modules/AI");
const { newArchipelago } = require("../modules/evolution");

// Inputs every brain is scored on in a generation. All brains in a generation see the same inputs (see
// `newInputs`), so two scores differ only because the brains differ, not because one drew easier inputs.
// That is what makes small, consistent improvements selectable: on x^5 over ±10, x^3 beats returning 0
// by 1.5%, invisible when every brain rolls its own inputs (score noise ±15%) and decisive when they share.
const TESTS_TO_RUN = 100;
// Steps a run may take. A run that uses all of them never finished and counts as a failure (see `fakeF`),
// so a brain has to halt or run off its end on its own. Otherwise the step limit works as a free loop
// counter: a loop of 10 instructions cut off at step 100 runs exactly 10 times, and brains evolve to
// pad themselves with dummy instructions to tune that count instead of finishing.
const STEPS_PER_RUN = 100;
// Score added per instruction and per data cell, once a brain's error is below PENALTY_GATE (see
// CONSTANT_FLOOR). Kept far below typical target error so it only decides between brains that are
// otherwise equally good: the smaller microVM wins.
const SIZE_PENALTY = 0.001;
// Score added per step a run executes, averaged over the brain's runs. A run ends when the program runs
// off its end or hits a halt.
const STEP_PENALTY = 0.001;
// The population is split into islands that evolve on their own, so an island that runs into a dead end
// (shrunk to a one-instruction constant, say) does not take the rest with it. Every MIGRATION_INTERVAL
// generations MIGRATION_ISLANDS random islands are crossed with each other (see modules/evolution.js).
const ISLANDS = 10;
const ISLAND_SIZE = 20;
const MIGRATION_INTERVAL = 1000;
const MIGRATION_ISLANDS = 3;
// Purely random brains added to every generation's pool, before scoring, as fresh blood.
const RANDOM_SEEDS_PER_GENERATION = 1;
// Survival odds by rank in the scored pool: the best brain always survives, the worst survives
// WORST_SURVIVAL of the time, and the odds fall off smoothly in between (see modules/evolution.js).
const WORST_SURVIVAL = 0.03;
// Fraction of children that start as a cross of their parent with a random other survivor before the
// usual mutation; the rest are mutated copies of one parent. 0 turns crossover off.
const CROSSOVER_RATE = 0.1;
// Mutation rates every brain starts with, all per element: the gaussian nudge on each data cell, and the
// chance per instruction of replacement, per instruction or data cell of a structural change, and per
// data cell of rounding. Each brain carries its own copy and hands it to its children shifted by
// RATE_ADAPTATION * gaussian per rate (clamped at 0), so lineages tune their own rates. A rate at 0
// switches that kind of mutation off for the child, but the rates themselves keep moving, so it comes
// back on. 0 keeps the rates fixed.
const INITIAL_RATES = {
    data: 0.1,
    instruction: 0.15,
    structure: 0.02,
    rounding: 0.02,
};
const RATE_ADAPTATION = 0.05;

const error = (expected, result) => {
    if (!Number.isFinite(result)) return Number.MAX_SAFE_INTEGER;
    return Math.abs(expected - result);
};

const RANGE = 10;

const sampleInput = () => RANGE * (Math.random() * 2 - 1);

// This generation's inputs, shared by every brain scored in it. Redrawn before every generation, so a
// brain is only compared with brains that saw the same inputs, and no brain can overfit one fixed set.
let inputs = [];
const newInputs = () => {
    inputs = Array.from({ length: TESTS_TO_RUN }, sampleInput);
};

const f = (x) => Math.sin(x);

// const f = (x) => x ** 2;

// Error of the best constant output, the median of f over the range: what a brain scores by ignoring its
// input. The size and step penalties only count once a brain's error is below half of this. Charged from
// the start they would strip every brain that has not found a foothold yet down to a one-instruction
// constant, because on a plateau "same output, one instruction shorter" always wins now that scores are
// paired, and a one-instruction brain has no material left to build with.
const CONSTANT_FLOOR = (() => {
    const values = Array.from({ length: 20000 }, () => f(sampleInput())).sort(
        (a, b) => a - b,
    );
    const median = values[values.length >> 1];
    return (
        values.reduce((sum, value) => sum + Math.abs(value - median), 0) /
        values.length
    );
})();
const PENALTY_GATE = CONSTANT_FLOOR / 2;

const fakeF = (x, brain) => {
    resetBrain(brain);
    brain.inputData[0] = x;
    brain.lastRunSteps = runBrain(brain, STEPS_PER_RUN);
    // Used every step it was given: it never finished, so the run failed (NaN scores as a huge error).
    if (brain.lastRunSteps >= STEPS_PER_RUN) return NaN;
    return brain.outputData[0];
};

// Scores a brain on this generation's shared inputs only. Nothing is carried over from earlier
// generations: a running average over old input sets would be compared against children scored on the
// new set, and the noise the shared inputs remove would come straight back.
const testBrain = (brain) => {
    let totalError = 0;
    let totalSteps = 0;
    for (const value of inputs) {
        totalError += error(f(value), fakeF(value, brain));
        totalSteps += brain.lastRunSteps;
    }
    brain.targetError = totalError / inputs.length;
    brain.averageSteps = totalSteps / inputs.length;
    brain.sizePenalty =
        SIZE_PENALTY * (brain.sizes.INSTRUCTIONS + brain.sizes.DATASIZE);
    brain.stepPenalty = STEP_PENALTY * brain.averageSteps;
    brain.score =
        brain.targetError +
        (brain.targetError < PENALTY_GATE
            ? brain.sizePenalty + brain.stepPenalty
            : 0);
    return brain.score;
};

const describeRates = (rates) =>
    Object.entries(rates)
        .map(([name, rate]) => name[0] + rate.toFixed(3))
        .join(" ");

const describe = (brain) =>
    `${brain.score.toPrecision(6)} (error ${brain.targetError.toPrecision(6)}, ${brain.sizes.INSTRUCTIONS} instructions, ${brain.sizes.DATASIZE} data, ${brain.averageSteps.toPrecision(4)} steps, rates ${describeRates(brain.rates)})`;

// Each island's best as error/instructions, so a collapsed or stuck island stands out.
const describeIslands = (islands) =>
    islands
        .map(
            ({ best }) =>
                `${best.targetError.toPrecision(3)}/${best.sizes.INSTRUCTIONS}`,
        )
        .join("  ");

// A key from the shared input: one character in a terminal, a whole line when stdin is piped.
const keyOf = (k) =>
    k === null ? "q" : typeof k === "string" ? k.trim() : k.str;

const runEntireTest = async (initialRates) => {
    const input = await createInput();
    const population = newArchipelago({
        islands: ISLANDS,
        size: ISLAND_SIZE,
        migrationInterval: MIGRATION_INTERVAL,
        migrationIslands: MIGRATION_ISLANDS,
        newBrain: () => newBrain({ INPUTSIZE: 1, OUTPUTSIZE: 1 }),
        score: testBrain,
        rates: initialRates,
        rateAdaptation: RATE_ADAPTATION,
        crossoverRate: CROSSOVER_RATE,
        randomSeeds: RANDOM_SEEDS_PER_GENERATION,
        worstSurvival: WORST_SURVIVAL,
    });
    let run = 0;
    console.log(
        `Returning the best constant scores ${CONSTANT_FLOOR.toPrecision(3)}; size and step penalties count below ${PENALTY_GATE.toPrecision(3)}.`,
    );
    console.log(
        "Keys: r = throw the population away and restart, p = stop and play with the current best, s = show the current best, q = quit",
    );
    evolve: while (true) {
        newInputs();
        const best = population.step();
        const t = population.generation - 1;
        if (t % 100 === 0) {
            console.log(`[run ${run}, gen ${t}] ${describe(best)}`);
            console.log(
                `  islands (error/instructions): ${describeIslands(population.islands)}`,
            );
        }

        // Give the event loop a turn so keypresses arrive, then act on them.
        await new Promise((resolve) => setImmediate(resolve));
        while (input.pending()) {
            const key = keyOf(await input.next());
            if (key === "r") {
                run++;
                population.reset();
                console.log(`Restart ${run}: fresh random population.`);
            } else if (key === "s") {
                console.log(
                    `[run ${run}, gen ${population.generation}] ${describe(population.best)}`,
                );
                console.log(
                    `  ${brainToString(population.best).split("\n")[0]}`,
                );
            } else if (key === "p") {
                break evolve;
            } else if (key === "q") {
                input.close();
                return;
            }
        }
    }
    console.log(
        `Stopped in run ${run} after ${population.generation} generations: ${describe(population.best)}`,
    );
    await traceBrain(population.best, {
        target: f,
        error,
        steps: STEPS_PER_RUN,
        input,
    });
    input.close();
};

const runMultipleTests = async (initialRates) => {
    let sumBestScore = 0;
    for (let n = 0; n < TESTS_TO_RUN; n++) {
        const bestScore = await runEntireTest(initialRates);
        sumBestScore += bestScore;
        console.log(sumBestScore / (n + 1));
    }
    return sumBestScore / TESTS_TO_RUN;
};

runEntireTest(INITIAL_RATES);

// runMultipleTests(0.1, 0.15);
// 0.1, 0.05 -> 6.444231773744312
// 0.1, 0.1 -> 4.655267167985314
// 0.1, 0.125 -> 4.17242535874885
// 0.1, 0.15 -> 3.191767330682215, 4.209636611855444,4.522688372706685, 4.085493770333082
// 0.1, 0.16 -> 4.484814114903509
// 0.1, 0.2 -> 4.658004218081943
// 0.1, 0.5 -> 11.554437551453127
// 0.1, 1 -> 16.22427481281371

// console.log("");

// const bestBrain = brains[0];

const printValuesInRange = (bestBrain) => {
    for (let i = -RANGE; i <= RANGE; i += 0.1) {
        const expected = f(i);
        const result = fakeF(i, bestBrain);

        console.log(
            i,
            ":",
            expected,
            ",",
            result,
            ";",
            error(expected, result),
        );
    }
};
