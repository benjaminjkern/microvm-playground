import { bots, gameNum, roundNum, templates } from "./game.js";
import { updatesPerFrame } from "./scene.js";

export const drawEloInfo = () => {
    if (templates.length < 2) return;

    if (updatesPerFrame > 1) {
        templates.sort(
            ({ overallElo: eloA }, { overallElo: eloB }) => eloB - eloA
        );
        document.getElementById("eloScores").innerText = `Highest: ${
            templates[0].overallElo
        }, Median: ${
            templates[Math.floor(templates.length / 2) - 1].overallElo
        }, Lowest: ${templates[templates.length - 1].overallElo}, Mean: ${
            templates.reduce((p, c) => p + c.overallElo, 0) / templates.length
        }\nOldest: ${Math.max(
            ...templates.map((template) => template.age)
        )}, Average age: ${
            templates.reduce((p, c) => p + c.age, 0) / templates.length
        }\n\nRound Num: ${roundNum}, Game Num: ${gameNum}`;
        return;
    }

    document.getElementById("eloScores").innerText = `Round:\nHighest: ${
        templates[0].elo
    }, Median: ${
        templates[Math.floor(templates.length / 2) - 1].elo
    }, Lowest: ${templates[templates.length - 1].elo}, Mean: ${
        templates.reduce((p, c) => p + c.elo, 0) / templates.length
    }\nOverall:`;

    templates.sort(({ overallElo: eloA }, { overallElo: eloB }) => eloB - eloA);

    document.getElementById("eloScores").innerText += `\nHighest: ${
        templates[0].overallElo
    }, Median: ${
        templates[Math.floor(templates.length / 2) - 1].overallElo
    }, Lowest: ${templates[templates.length - 1].overallElo}, Mean: ${
        templates.reduce((p, c) => p + c.overallElo, 0) / templates.length
    }\nOldest: ${Math.max(
        ...templates.map((template) => template.age)
    )}, Average age: ${
        templates.reduce((p, c) => p + c.age, 0) / templates.length
    }\n\nRound Num: ${roundNum}, Game Num: ${gameNum}\n\nLeft: ${
        bots[0].overallElo
    }, Right: ${bots[1].overallElo}`;
};
