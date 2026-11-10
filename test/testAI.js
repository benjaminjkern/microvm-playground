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
    crossoverBrains,
} = require("../modules/AI");

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
// WORST_SURVIVAL of the time, and the odds fall off smoothly in between. A straight line from 100% to
// 3% would average 51.5% and keep more than half, so the line is bent just enough (solved each
// generation) that the odds add up to exactly POPULATION. Survivors are then drawn with exactly those
// odds; see selectSurvivors.
const WORST_SURVIVAL = 0.03;
// Fraction of children that start as a cross of their parent with a random other survivor before the
// usual mutation; the rest are mutated copies of one parent. 0 turns crossover off.
const CROSSOVER_RATE = 0.5;

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

const describe = (brain) =>
    `${brain.score.toPrecision(6)} (error ${brain.targetError.toPrecision(6)}, ${brain.sizes.INSTRUCTIONS} instructions, ${brain.sizes.DATASIZE} data, ${brain.averageSteps.toPrecision(4)} steps)`;

// A key from the shared input: one character in a terminal, a whole line when stdin is piped.
const keyOf = (k) =>
    k === null ? "q" : typeof k === "string" ? k.trim() : k.str;

// odds[i] = WORST_SURVIVAL + (1 - WORST_SURVIVAL) * (1 - i / (n - 1)) ** gamma, with gamma found by
// bisection so the odds sum to exactly `count` (the sum falls as gamma rises).
const survivalOdds = (n, count) => {
    if (count >= n) return Array(n).fill(1);
    const odds = (gamma) =>
        Array.from(
            { length: n },
            (_, i) =>
                WORST_SURVIVAL +
                (1 - WORST_SURVIVAL) * (1 - i / (n - 1)) ** gamma,
        );
    let lo = 0;
    let hi = 64;
    for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (odds(mid).reduce((a, b) => a + b, 0) > count) lo = mid;
        else hi = mid;
    }
    return odds((lo + hi) / 2);
};

// Stochastic cut with exact odds: lay the odds end to end and take every brain whose stretch contains
// one of the evenly spaced points u, u+1, u+2, ... (systematic sampling). Each brain survives with
// exactly its odds, and exactly `count` survive because the odds sum to `count`.
const selectSurvivors = (sorted, count) => {
    const odds = survivalOdds(sorted.length, count);
    const survivors = [];
    let cumulative = 0;
    let point = Math.random();
    sorted.forEach((brain, i) => {
        cumulative += odds[i];
        if (cumulative > point) {
            survivors.push(brain);
            point += 1;
        }
    });
    // floating-point slack can leave one short; top up with the best brain not yet taken
    for (const brain of sorted) {
        if (survivors.length >= count) break;
        if (!survivors.includes(brain)) survivors.push(brain);
    }
    return survivors.sort((a, b) => a.score - b.score);
};

const runEntireTest = async (
    dataMutationRate,
    instructionMutationRate,
    structureMutationRate,
    dataRoundingRate,
) => {
    const input = await createInput();
    const freshBrains = (count) =>
        Array(count)
            .fill()
            .map(() => newBrain({ INPUTSIZE: 1, OUTPUTSIZE: 1 }));
    let brains = freshBrains(POPULATION);
    let run = 0;
    let t = 0;
    console.log(
        "Keys: r = throw the population away and restart, p = stop and play with the current best, s = show the current best, q = quit",
    );
    evolve: while (true) {
        // Each survivor gets one child: a mutated copy of itself or, CROSSOVER_RATE of the time, a
        // mutated cross of itself with a random other survivor.
        const survivors = brains;
        const children = survivors.map((brain) => {
            const mate =
                survivors[Math.floor(Math.random() * survivors.length)];
            const parent =
                Math.random() < CROSSOVER_RATE
                    ? crossoverBrains(brain, mate)
                    : brain;
            return mutateBrain(
                parent,
                dataMutationRate,
                instructionMutationRate,
                structureMutationRate,
                dataRoundingRate,
            );
        });
        brains = survivors.concat(
            children,
            freshBrains(RANDOM_SEEDS_PER_GENERATION),
        );

        brains.map(testBrain);
        brains.sort((a, b) => a.score - b.score);
        brains = selectSurvivors(brains, POPULATION);

        if (t % 100 === 0)
            console.log(`[run ${run}, gen ${t}] ${describe(brains[0])}`);
        t++;

        // Give the event loop a turn so keypresses arrive, then act on them.
        await new Promise((resolve) => setImmediate(resolve));
        while (input.pending()) {
            const key = keyOf(await input.next());
            if (key === "r") {
                run++;
                t = 0;
                brains = freshBrains(POPULATION);
                console.log(`Restart ${run}: fresh random population.`);
            } else if (key === "s") {
                console.log(`[run ${run}, gen ${t}] ${describe(brains[0])}`);
                console.log(`  ${brainToString(brains[0]).split("\n")[0]}`);
            } else if (key === "p") {
                break evolve;
            } else if (key === "q") {
                input.close();
                return;
            }
        }
    }
    console.log(
        `Stopped in run ${run} after ${t} generations: ${describe(brains[0])}`,
    );
    await traceBrain(brains[0], {
        target: f,
        error,
        steps: STEPS_PER_RUN,
        input,
    });
    input.close();
};

const runMultipleTests = async (
    dataMutationRate,
    instructionMutationRate,
    structureMutationRate,
    dataRoundingRate,
) => {
    let sumBestScore = 0;
    for (let n = 0; n < TESTS_TO_RUN; n++) {
        const bestScore = await runEntireTest(
            dataMutationRate,
            instructionMutationRate,
            structureMutationRate,
            dataRoundingRate,
        );
        sumBestScore += bestScore;
        console.log(sumBestScore / (n + 1));
    }
    return sumBestScore / TESTS_TO_RUN;
};

runEntireTest(0.1, 0.15, 0.1, 0.1);

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
