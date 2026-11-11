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
const { newPopulation } = require("../modules/evolution");

const TESTS_TO_RUN = 100;
const STEPS_PER_RUN = 100;
// Score added per instruction and per data cell. Kept far below typical target error so it only
// decides between brains that are otherwise equally good: the smaller microVM wins.
const SIZE_PENALTY = 0.001;
// Score added per step a run executes before halting, averaged over the brain's runs. A brain that
// never halts pays for all STEPS_PER_RUN of them, so halting early is rewarded.
const STEP_PENALTY = 0.001;
const POPULATION = 50;
// Purely random brains added to every generation's pool, before scoring, as fresh blood.
const RANDOM_SEEDS_PER_GENERATION = 1;
// Survival odds by rank in the scored pool: the best brain always survives, the worst survives
// WORST_SURVIVAL of the time, and the odds fall off smoothly in between (see modules/evolution.js).
const WORST_SURVIVAL = 0.03;
// Fraction of children that start as a cross of their parent with a random other survivor before the
// usual mutation; the rest are mutated copies of one parent. 0 turns crossover off.
const CROSSOVER_RATE = 0;
// Mutation rates every brain starts with. Each brain carries its own copy and hands it to its children
// with a random tweak of exp(RATE_ADAPTATION * gaussian) per rate, so lineages tune their own rates.
// 0 keeps the rates fixed.
const INITIAL_RATES = {
    data: 0.1,
    instruction: 0.15,
    structure: 0.1,
    rounding: 0.1,
};
const RATE_ADAPTATION = 0.2;

const error = (expected, result) => {
    if (!Number.isFinite(result)) return Number.MAX_SAFE_INTEGER;
    return Math.abs(expected - result);
};

const RANGE = 10;

const sampleInput = () => RANGE * (Math.random() * 2 - 1);

const f = (x) => x ** 2 - 2 * x + 1;

// const f = (x) => x ** 2;

const fakeF = (x, brain) => {
    resetBrain(brain);
    brain.inputData[0] = x;
    brain.lastRunSteps = runBrain(brain, STEPS_PER_RUN);
    return brain.outputData[0];
};

const testBrain = (brain) => {
    let totalError = 0;
    let totalSteps = 0;
    for (let i = 0; i < TESTS_TO_RUN; i++) {
        const value = sampleInput();
        totalError += error(f(value), fakeF(value, brain));
        totalSteps += brain.lastRunSteps;
    }
    brain.totalError = (brain.totalError || 0) + totalError;
    brain.totalSteps = (brain.totalSteps || 0) + totalSteps;
    brain.totalRuns = (brain.totalRuns || 0) + TESTS_TO_RUN;
    brain.targetError = brain.totalError / brain.totalRuns;
    brain.averageSteps = brain.totalSteps / brain.totalRuns;
    brain.sizePenalty =
        SIZE_PENALTY * (brain.sizes.INSTRUCTIONS + brain.sizes.DATASIZE);
    brain.stepPenalty = STEP_PENALTY * brain.averageSteps;
    brain.score = brain.targetError + brain.sizePenalty + brain.stepPenalty;
    return brain.score;
};

const describeRates = (rates) =>
    Object.entries(rates)
        .map(([name, rate]) => name[0] + rate.toFixed(3))
        .join(" ");

const describe = (brain) =>
    `${brain.score.toPrecision(6)} (error ${brain.targetError.toPrecision(6)}, ${brain.sizes.INSTRUCTIONS} instructions, ${brain.sizes.DATASIZE} data, ${brain.averageSteps.toPrecision(4)} steps, rates ${describeRates(brain.rates)})`;

// A key from the shared input: one character in a terminal, a whole line when stdin is piped.
const keyOf = (k) =>
    k === null ? "q" : typeof k === "string" ? k.trim() : k.str;

const runEntireTest = async (initialRates) => {
    const input = await createInput();
    const population = newPopulation({
        size: POPULATION,
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
        "Keys: r = throw the population away and restart, p = stop and play with the current best, s = show the current best, q = quit",
    );
    evolve: while (true) {
        const best = population.step();
        const t = population.generation - 1;
        if (t % 100 === 0)
            console.log(`[run ${run}, gen ${t}] ${describe(best)}`);

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
