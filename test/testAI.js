const {
    newBrain,
    printBrainInstructions,
    runBrain,
    mutateBrain,
    resetBrain,
    printBrain,
    traceBrain,
} = require("../modules/AI");

const TESTS_TO_RUN = 100;
const STEPS_PER_RUN = 100;
// Score added per instruction and per data cell. Kept far below typical target error so it only
// decides between brains that are otherwise equally good: the smaller microVM wins.
const SIZE_PENALTY = 0.001;
// Score added per step a run executes before halting, averaged over the brain's runs. A brain that
// never halts pays for all STEPS_PER_RUN of them, so halting early is rewarded.
const STEP_PENALTY = 0.001;
// Stopping rules. Converged: the best and worst survivors have the same score (within TOLERANCE)
// and have stayed that way for CONVERGED_GENERATIONS, which gives smaller exact variants time to
// show up and break the tie. Stagnant: the cutoff score (the worst survivor) has not improved for
// PATIENCE generations, for targets the brains never match exactly.
const TOLERANCE = 1e-9;
const CONVERGED_GENERATIONS = 100;
const PATIENCE = 2000;

const error = (expected, result) => {
    if (!Number.isFinite(result)) return Number.MAX_SAFE_INTEGER;
    return Math.abs(expected - result);
};

const RANGE = 10;

const sampleInput = () => RANGE * (Math.random() * 2 - 1);

const f = (x) => x ** 2 - 4 * x + 1;

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

const runEntireTest = (
    dataMutationRate,
    instructionMutationRate,
    structureMutationRate,
) => {
    let brains = Array(50)
        .fill()
        .map(() => newBrain({ INPUTSIZE: 1, OUTPUTSIZE: 1 }));
    let t = 0;
    let convergedFor = 0;
    let bestCutoff = Infinity;
    let lastImprovement = 0;
    while (true) {
        brains.map((brain) => {
            brains.push(
                mutateBrain(
                    brain,
                    dataMutationRate,
                    instructionMutationRate,
                    structureMutationRate,
                ),
            );
        });

        brains.map(testBrain);
        brains.sort((a, b) => a.score - b.score);
        brains = brains.slice(0, brains.length / 2);

        if (t % 100 === 0) {
            const best = brains[0];
            console.log(
                `${best.score.toPrecision(6)}  (error ${best.targetError.toPrecision(6)}, ${best.sizes.INSTRUCTIONS} instructions, ${best.sizes.DATASIZE} data, ${best.averageSteps.toPrecision(4)} steps)`,
            );
        }

        const best = brains[0];
        const worst = brains[brains.length - 1];
        convergedFor =
            worst.score - best.score <= TOLERANCE ? convergedFor + 1 : 0;
        if (convergedFor >= CONVERGED_GENERATIONS) {
            console.log(
                `Converged after ${t} generations: all ${brains.length} survivors score ${best.score.toPrecision(6)} (error ${best.targetError.toPrecision(6)}, ${best.sizes.INSTRUCTIONS} instructions, ${best.sizes.DATASIZE} data, ${best.averageSteps.toPrecision(4)} steps).`,
            );
            break;
        }
        if (worst.score < bestCutoff - TOLERANCE) {
            bestCutoff = worst.score;
            lastImprovement = t;
        } else if (t - lastImprovement >= PATIENCE) {
            console.log(
                `Stopped after ${t} generations: cutoff score ${worst.score.toPrecision(6)} has not improved for ${PATIENCE} generations.`,
            );
            break;
        }
        t++;
    }
    traceBrain(brains[0], { target: f, error, steps: STEPS_PER_RUN });
    // return brains[0].score;
};

const runMultipleTests = (
    dataMutationRate,
    instructionMutationRate,
    structureMutationRate,
) => {
    let sumBestScore = 0;
    for (let n = 0; n < TESTS_TO_RUN; n++) {
        const bestScore = runEntireTest(
            dataMutationRate,
            instructionMutationRate,
            structureMutationRate,
        );
        sumBestScore += bestScore;
        console.log(sumBestScore / (n + 1));
    }
    return sumBestScore / TESTS_TO_RUN;
};

runEntireTest(0.1, 0.15, 0.1);

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
