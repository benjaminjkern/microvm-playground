import { templates } from "./game.js";
import { playArea } from "./scene.js";

export const graphs = [];

export let showingGraph = 0;

export const initGraphs = (document) => {
    const NUM_GRAPHS = 3;

    for (let g = 0; g < NUM_GRAPHS; g++) {
        const graphCanvas = document.getElementById("graph" + g);
        graphs.push({
            canvas: graphCanvas,
            ctx: graphCanvas.getContext("2d"),
        });

        graphCanvas.width = 200;
        graphCanvas.height = playArea.height;
        if (g !== showingGraph) graphCanvas.style.display = "none";
    }
};

export const addLineToGraph = (graphIndex) => {
    const { canvas, ctx } = graphs[graphIndex];
    const temp = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(temp, 0, -1);

    const WIDTH2 = canvas.width / templates.length;
    for (const [i, template] of templates.entries()) {
        ctx.fillStyle = template.color;
        ctx.fillRect(
            Math.floor(i * WIDTH2),
            playArea.width - 1,
            Math.ceil(WIDTH2),
            1
        );
    }
};

export const addLineToLineGraph = (graphIndex, valueGetter = () => 1) => {
    let { canvas, ctx, min = 0, max = 0 } = graphs[graphIndex];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!graphs[graphIndex].history) graphs[graphIndex].history = [];

    const values = templates.map(valueGetter);
    const newMin = Math.min(min, ...values);
    const newMax = Math.max(max, ...values);

    graphs[graphIndex].min = newMin;
    graphs[graphIndex].max = newMax;

    graphs[graphIndex].history.push(values);
    graphs[graphIndex].history = graphs[graphIndex].history.slice(
        Math.max(0, graphs[graphIndex].history.length - playArea.height - 2)
    );

    const toScreenCoords = (x) =>
        ((x - newMin) / (newMax - newMin)) * canvas.width;

    const getRelativeIndex = (relativeIndex, list) => {
        const estimate = (list.length - 1) * relativeIndex;
        const up = Math.ceil(estimate);
        const down = Math.floor(estimate);
        const diff = estimate - down;
        return list[up] * diff + list[down] * (1 - diff);
    };

    const restOfHistory = graphs[graphIndex].history.slice(1);

    const makePath = (
        relativeIndex,
        { color = "black", thickness = 1 } = {}
    ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(
            toScreenCoords(
                getRelativeIndex(relativeIndex, graphs[graphIndex].history[0])
            ),
            0
        );
        for (const [y, h] of restOfHistory.entries()) {
            ctx.lineTo(toScreenCoords(getRelativeIndex(relativeIndex, h)), y);
        }
        ctx.stroke();
    };

    makePath(0, { thickness: 2 });
    makePath(1, { thickness: 2 });

    makePath(1 / 10);
    makePath(2 / 10);
    makePath(3 / 10);
    makePath(4 / 10);
    makePath(6 / 10);
    makePath(7 / 10);
    makePath(8 / 10);
    makePath(9 / 10);

    makePath(1 / 2, { color: "red", thickness: 2 });

    // const WIDTH2 = canvas.width / templates.length;
    // for (const [i, template] of templates.entries()) {
    //     ctx.fillStyle = template.color;
    //     ctx.fillRect(Math.floor(i * WIDTH2), 799, Math.ceil(WIDTH2), 1);
    // }
};

export const switchShowingGraph = () => {
    graphs[showingGraph].canvas.style.display = "none";
    showingGraph = (showingGraph + 1) % graphs.length;
    graphs[showingGraph].canvas.style.display = "block";
};
