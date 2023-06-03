const {
    newBrain,
    printBrainInstructions,
    runBrain,
    mutateBrain,
    resetBrain,
} = require("./AI");

const TESTS_TO_RUN = 100;

const error = (expected, result) => {
    return Math.abs(expected - result);
};

const RANGE = 10;

const sampleInput = () => RANGE * (Math.random() * 2 - 1);

const f = (x) => x ** 2 - 4 * x + 1;

const fakeF = (x, brain) => {
    resetBrain(brain);
    brain.inputData[0] = x;
    runBrain(brain, 100);
    return brain.outputData[0];
};

const testBrain = (brain) => {
    let totalError = 0;
    for (let i = 0; i < TESTS_TO_RUN; i++) {
        const value = sampleInput();
        totalError += error(f(value), fakeF(value, brain));
    }
    brain.totalError = (brain.totalError || 0) + totalError;
    brain.totalRuns = (brain.totalRuns || 0) + TESTS_TO_RUN;
    brain.score = brain.totalError / brain.totalRuns;
    return brain.score;
};

const runEntireTest = (dataMutationRate, instructionMutationRate) => {
    let brains = Array(50)
        .fill()
        .map(() => newBrain({ IOSIZE: 1 }));
    let t = 0;
    while (t < 500) {
        brains.map((brain) => {
            brains.push(
                mutateBrain(brain, dataMutationRate, instructionMutationRate)
            );
        });

        brains.map(testBrain);
        brains.sort((a, b) => a.score - b.score);
        brains = brains.slice(0, brains.length / 2);

        // if (t % 100 === 0) console.log(brains[0].score);

        if (brains[brains.length - 1].score === 0) break;
        t++;
    }
    return brains[0].score;
};

const runMultipleTests = (dataMutationRate, instructionMutationRate) => {
    let sumBestScore = 0;
    for (let n = 0; n < TESTS_TO_RUN; n++) {
        const bestScore = runEntireTest(
            dataMutationRate,
            instructionMutationRate
        );
        sumBestScore += bestScore;
        console.log(sumBestScore / (n + 1));
    }
    return sumBestScore / TESTS_TO_RUN;
};

runMultipleTests(0.1, 0.15);
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

const playWithBrain = (bestBrain) => {
    const prompt = require("prompt-sync")();

    while (true) {
        const s = prompt("Gimme input: ");
        if (isNaN(s)) break;

        const n = Number(s);
        console.log("Expected output:", f(n));
        console.log("Brain output:", fakeF(n, bestBrain));
    }
};

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
            error(expected, result)
        );
    }
};
