import { randomColor, forceFinite } from "./utils.js";
import {
    addVec,
    multConstVec,
    subVec,
    unitVecFromAngle,
    vecDistSquared,
    vecDot,
} from "./vecMath.js";
import { removeAllBullets, bullets, newBullet } from "./bullet.js";
import { addLineToGraph, addLineToLineGraph } from "./graph.js";
import {
    brainToString,
    mutateBrain,
    newBrain,
    printBrain,
    resetBrain,
    runBrain,
} from "./AI.js";
import {
    getManualBotInputs,
    manualPlayMode,
    playArea,
    restartScene,
    updatesPerFrame,
} from "./scene.js";
import html2canvas from "./html2canvas.js";
import saveAs from "./FileSaver.js";

const MAX_TEMPLATES = 100;
const RADIUS = 25;
const RECORDING_KILLS = false;
const END_ROUND_ON_KILL = true;
const GAMES_PER_ROUND = 1000; //(MAX_TEMPLATES * (MAX_TEMPLATES - 1)) / 2;
const INSTRUCTIONS_RUN_PER_FRAME = 64;

export let templates = [];
export let bots = [];
export let roundNum = 0;
export let gameNum = 0;

let backupBots = [];
let templateIndex = 0;

export const newTemplate = (
    oldTemplate,
    mutation = 0.1,
    addToTemplates = true
) => {
    const template = {
        longName:
            oldTemplate?.longName !== undefined
                ? `${oldTemplate.longName},${templateIndex}`
                : `${templateIndex}`,
        id: templateIndex,
        color: randomColor(oldTemplate?.color),
        brain: oldTemplate
            ? mutateBrain(oldTemplate.brain, mutation, mutation)
            : newBrain(),
        overallElo: 0,
        elo: 0,
        age: 0,
    };
    if (addToTemplates) {
        templateIndex++;
        templates.push(template);
    }
    return template;
};

export const drawTemplateBar = (ctx) => {
    if (updatesPerFrame > 1) return;
    templates.sort(({ elo: eloA }, { elo: eloB }) => eloB - eloA);

    const WIDTH = playArea.width / templates.length;
    for (const [i, template] of templates.entries()) {
        ctx.fillStyle = template.color;
        ctx.fillRect(
            Math.floor(i * WIDTH),
            playArea.height - 20,
            Math.ceil(WIDTH),
            20
        );
    }
};

export const starterTemplates = () => {
    while (templates.length < MAX_TEMPLATES) {
        newTemplate();
    }
};

const eloUpdate = (winnerTemplate, loserTemplate, tie, eloKey) => {
    const P =
        1 /
        (1 + 10 ** ((loserTemplate[eloKey] - winnerTemplate[eloKey]) / 400));
    const diff = 40 * ((tie ? 0.5 : 1) - P);
    winnerTemplate[eloKey] += diff;
    loserTemplate[eloKey] -= diff;
};

export const loser = () => {
    bots.sort(({ hits: hitsA }, { hits: hitsB }) => hitsB - hitsA);

    const [loserBot, winnerBot] = bots;
    const loserIndex = loserBot.hits === winnerBot.hits ? -1 : 0;

    const winnerTemplate = templates.find((x) => x.id === winnerBot.id);
    const loserTemplate = templates.find((x) => x.id === loserBot.id);
    eloUpdate(winnerTemplate, loserTemplate, loserIndex === -1, "elo");
    eloUpdate(winnerTemplate, loserTemplate, loserIndex === -1, "overallElo");
    newGame();
};

export const newRound = () => {
    if (roundNum > 0) {
        let suffix = templates[0].longName;
        for (const { longName } of templates) {
            for (let i = 0; i < suffix.length; i++) {
                if (suffix[i] === longName[i]) continue;
                suffix = suffix.substring(0, i);
            }
            if (!suffix.length) break;
        }
        if (suffix.length)
            templates.forEach(
                (template) =>
                    (template.longName = template.longName.substring(
                        suffix.length
                    ))
            );

        templates.sort(
            ({ overallElo: eloA }, { overallElo: eloB }) => eloB - eloA
        );
        addLineToLineGraph(0, (template) => template.overallElo);
        const botString = brainToString(templates[0].brain);

        // if (templates.some(({ id }) => !lastTemplates[id])) {
        addLineToGraph(2);
        templates.sort(({ longName: longNameA }, { longName: longNameB }) =>
            longNameA > longNameB ? 1 : -1
        );
        addLineToGraph(1);
        // }
        templates.sort(({ elo: eloA }, { elo: eloB }) => eloB - eloA);
        templates = templates.slice(0, MAX_TEMPLATES / 2);
        // const median = templates[Math.floor(templates.length / 2) - 1].elo;
        templates.forEach((template, i) => {
            // template.elo -= median;
            template.elo = 0;
            template.age++;
            newTemplate(i < MAX_TEMPLATES / 2 - 1 ? template : undefined);
        });

        if (roundNum % 500 === 0) {
            const botBlob = new Blob([botString], {
                type: "text/plain",
            });

            saveAs(botBlob, `${roundNum}.txt`);

            // html2canvas(document.body).then((canvas) => {
            //     const base64image = canvas.toDataURL("image/png");
            //     const data = atob(
            //         base64image.substring("data:image/png;base64,".length)
            //     );
            //     const imgArray = new Uint8Array(data.length);

            //     for (let i = 0; i < data.length; ++i) {
            //         imgArray[i] = data.charCodeAt(i);
            //     }

            //     const imgBlob = new Blob([imgArray.buffer], {
            //         type: "image/png",
            //     });
            //     saveAs(imgBlob, `${roundNum}.png`);

            // });
        }
    }
    roundNum++;
    newGame();
};

const newGame = () => {
    if (gameNum >= GAMES_PER_ROUND) {
        gameNum = 0;
        newRound();
        return;
    }
    gameNum++;

    let a = templates[Math.floor(Math.random() * templates.length)];
    let b;
    while (!b || a === b)
        b = templates[Math.floor(Math.random() * templates.length)];

    bots = [newBot(a), newBot(b, true)];
    bots.forEach((bot) => resetBrain(bot.brain));

    removeAllBullets();

    restartScene();
};

export const newManualGame = () => {
    backupBots = bots;

    templates.sort(({ overallElo: eloA }, { overallElo: eloB }) => eloB - eloA);
    const bestTemplate = newTemplate(templates[0], 0, false);
    bestTemplate.overallElo = templates[0].overallElo;
    bots = [
        newBot(bestTemplate),
        newBot(newTemplate(undefined, undefined, false), true),
    ];
    bots.forEach((bot) => resetBrain(bot.brain));

    removeAllBullets();
};

export const backToAutoGame = () => {
    bots = backupBots;
};

const startingPos = (rightSide) => [
    (playArea.width * (1 + 2 * rightSide)) / 4,
    playArea.height / 2,
];

const newBot = (template = newTemplate(), rightSide = false) => {
    return {
        ...template,
        pos: startingPos(rightSide),
        angle: !rightSide * Math.PI,
        bulletTimer: 0,
        rightSide,
        isManual: rightSide && manualPlayMode,
        hits: 0,
    };
};

export const moveBots = () => {
    for (const bot of bots) {
        const enemy = bots[1 - bot.rightSide];
        const diff = subVec(bot.pos, enemy.pos);
        const c = vecDot(diff, diff) - RADIUS ** 2;

        const dist = (angle, diff, c) => {
            const u = unitVecFromAngle(angle);
            const b = 2 * vecDot(u, diff);
            const det = b ** 2 - 4 * c;
            if (det < 0) return -1;
            const x = (b + Math.sqrt(det)) / -2;
            if (x < 0) return -1;
            return x;
        };

        const enemyBullets = Object.keys(bullets)
            .map((bulletKey) => bullets[bulletKey])
            .filter((bullet) => bullet.owner !== bot);

        const bulletCs = enemyBullets.map((bullet) => {
            const bDiff = subVec(bot.pos, bullet.pos);
            return [bDiff, vecDot(bDiff, bDiff) - bullet.radius ** 2];
        });

        const angles = Array(7)
            .fill()
            .map((_, i) => bot.angle + (Math.PI / 4 / 6) * (i - 3));

        const enemyDists = angles.map((angle) => dist(angle, diff, c));
        const bulletDists = angles.map((angle) => {
            let closestBullet = Number.MAX_SAFE_INTEGER;
            for (const [bDiff, c] of bulletCs) {
                let bulletDist = dist(angle, bDiff, c);
                if (bulletDist === -1 || bulletDist >= closestBullet) continue;
                closestBullet = bulletDist;
            }
            if (closestBullet === Number.MAX_SAFE_INTEGER) return -1;
            return closestBullet;
        });

        for (const bullet of enemyBullets) {
            const distSquared = vecDistSquared(bot.pos, bullet.pos);
            if (distSquared < (bullet.radius + RADIUS) ** 2) {
                // if (t < 10) console.log("Boot!", distSquared, bullets);
                if (RECORDING_KILLS || manualPlayMode)
                    console.log(bot.isManual ? "Hit" : "Kill");

                bot.hits++;

                delete bullets[bullet.key];

                if (END_ROUND_ON_KILL) {
                    if (manualPlayMode) continue;
                    loser(+bot.rightSide);
                    return;
                }
            }
        }

        bot.brain.inputData = [...enemyDists, ...bulletDists, 1, Math.random()];
        runBrain(bot.brain, INSTRUCTIONS_RUN_PER_FRAME);
        const [speed, angleSpeed, shoot, shootBig] = bot.isManual
            ? getManualBotInputs()
            : bot.brain.outputData;
        const u = unitVecFromAngle(bot.angle);

        bot.angle += Math.min(Math.max(forceFinite(angleSpeed), -0.1), 0.1);
        bot.pos = addVec(
            bot.pos,
            multConstVec(Math.min(Math.max(forceFinite(speed), -5), 5), u)
        );

        if (bot.pos[0] + RADIUS >= playArea.width)
            bot.pos[0] = playArea.width - RADIUS;
        if (bot.pos[0] - RADIUS <= 0) bot.pos[0] = RADIUS;
        if (bot.pos[1] + RADIUS >= playArea.height)
            bot.pos[1] = playArea.height - RADIUS;
        if (bot.pos[1] - RADIUS <= 0) bot.pos[1] = RADIUS;

        bot.bulletTimer--;

        if (bot.bulletTimer <= 0) {
            if (shoot > 0) {
                bot.bulletTimer = 100;
                newBullet(bot, shootBig > 0);
            }
        }
    }
};

export const drawBots = (ctx) => {
    for (const bot of bots) {
        ctx.fillStyle = bot.color;
        ctx.beginPath();
        ctx.arc(...bot.pos, RADIUS, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.moveTo(...bot.pos);
        ctx.lineTo(
            ...addVec(
                bot.pos,
                multConstVec(RADIUS, unitVecFromAngle(bot.angle))
            )
        );
        ctx.stroke();
    }
};

export const printBrainsToConsole = () => {
    for (const bot of bots) {
        printBrain(bot.brain);
    }
};
