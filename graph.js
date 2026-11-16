import { newBrainFromString, runBrain, resetBrain } from "./modules/AI.js";

/**
 * graph.html: a brain's output drawn against a target function. Paste a brain (the form `brainToString`
 * prints and brains/*.txt hold), give the target as a JavaScript expression in x, and see the two curves,
 * the error, and the steps each run took. The modules are ES modules, so the page has to be served, not
 * opened as a file: `python3 -m http.server` in the repo root, then http://localhost:8000/graph.html.
 * `graph.html?brain=brains/some.txt` starts from that file.
 *
 * `sample` and `summarize` have no DOM in them, so they can be tested from Node.
 */

/**
 * Run a brain over an evenly spaced range of inputs, as test/testAI.js would score it: a run that uses
 * every step it is given never finished and counts as failed.
 * @returns {{ brain, points: { x, out, target, steps, failed, error }[] }}
 */
export const sample = (brainText, targetExpression, { min, max, samples, cap }) => {
    const brain = newBrainFromString(brainText, {}, { INPUTSIZE: 1 });
    const f = new Function("x", `return (${targetExpression});`);
    const points = [];
    for (let i = 0; i < samples; i++) {
        const x = min + ((max - min) * i) / (samples - 1);
        resetBrain(brain);
        brain.inputData[0] = x;
        const steps = runBrain(brain, cap);
        const out = brain.outputData[0];
        const target = Number(f(x));
        const failed = steps >= cap || !Number.isFinite(out);
        points.push({
            x,
            out,
            target,
            steps,
            failed,
            error: failed ? NaN : Math.abs(target - out),
        });
    }
    return { brain, points };
};

export const summarize = (points) => {
    const finished = points.filter((p) => !p.failed);
    return {
        failed: points.length - finished.length,
        meanError:
            finished.reduce((sum, p) => sum + p.error, 0) /
            (finished.length || 1),
        worst: finished.reduce(
            (worst, p) => (p.error > worst.error ? p : worst),
            { error: -1 },
        ),
        meanSteps: points.reduce((sum, p) => sum + p.steps, 0) / points.length,
    };
};

// ---- the page ----------------------------------------------------------------------------------------

const FALLBACK_BRAIN = `# sin(x) on -10..10 after a million generations (brains/sin-1M-generations.txt)
readInput 0 6,sub 3 6 5,max 6 5 6,sub 6 3 2,jgz 1 9,jgz 0 14,max 6 4 6,sub 6 0 1,jump 2,sub 2 3 6,mult 4 2 5,jgz 2 6,mult 0 5 4,min 4 0 6,writeOutput 6 0
0.961908,0.951441,0.0207181,3.14153,-0.948026,-0.98975,1.02476
6.38484`;

const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, text) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
};
const fmt = (v) => (Number.isFinite(v) ? String(+v.toPrecision(4)) : String(v));

// Tick values for an axis: a "nice" step (1, 2 or 5 times a power of ten) giving about `count` ticks.
const ticks = (low, high, count) => {
    const raw = (high - low) / count;
    const power = 10 ** Math.floor(Math.log10(raw));
    const ratio = raw / power;
    const step = (ratio < 1.5 ? 1 : ratio < 3.5 ? 2 : ratio < 7.5 ? 5 : 10) * power;
    const values = [];
    for (let v = Math.ceil(low / step) * step; v <= high + step * 1e-9; v += step)
        values.push(+v.toFixed(10));
    return values;
};

// An SVG path through the points, lifting the pen wherever the value is not a number.
const pathOf = (points, sx, sy, value) => {
    let d = "";
    let pen = false;
    for (const p of points) {
        const v = value(p);
        if (!Number.isFinite(v)) {
            pen = false;
            continue;
        }
        d += `${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(v).toFixed(1)}`;
        pen = true;
    }
    return d;
};

const draw = (svg, points, cap) => {
    svg.replaceChildren();
    const W = 960;
    const H = 560;
    const L = 64;
    const R = 60;
    const T = 28;
    const B = 40;
    const topH = 320;
    const botTop = T + topH + 44;
    const botH = H - botTop - B;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const xmin = points[0].x;
    const xmax = points[points.length - 1].x;
    const targets = points.map((p) => p.target).filter(Number.isFinite);
    const tmin = Math.min(...targets);
    const tmax = Math.max(...targets);
    const tspan = tmax - tmin || 1;
    // The target sets the scale. Outputs within three target spans of it stretch the scale; anything
    // further out is drawn clamped to the edge, so one wild output cannot flatten the rest.
    const near = points
        .filter((p) => !p.failed && p.out > tmin - 3 * tspan && p.out < tmax + 3 * tspan)
        .map((p) => p.out);
    let ymin = Math.min(tmin, ...near);
    let ymax = Math.max(tmax, ...near);
    const pad = (ymax - ymin || 1) * 0.08;
    ymin -= pad;
    ymax += pad;
    const sx = (x) => L + ((x - xmin) / (xmax - xmin)) * (W - L - R);
    const sy = (y) =>
        T + ((ymax - Math.min(ymax, Math.max(ymin, y))) / (ymax - ymin)) * topH;
    const errors = points.map((p) => p.error).filter(Number.isFinite);
    const emax = Math.max(1e-9, ...errors);
    const sye = (e) => botTop + (1 - e / emax) * botH;
    const sys = (s) => botTop + (1 - s / cap) * botH;

    const group = (cls) => svg.appendChild(el("g", { class: cls }));

    const grid = group("grid");
    for (const v of ticks(ymin, ymax, 6)) {
        grid.append(
            el("line", { x1: L, x2: W - R, y1: sy(v), y2: sy(v) }),
            el("text", { x: L - 8, y: sy(v) + 4, "text-anchor": "end" }, fmt(v)),
        );
    }
    for (const v of ticks(xmin, xmax, 10)) {
        grid.append(
            el("line", { x1: sx(v), x2: sx(v), y1: T, y2: T + topH }),
            el("line", { x1: sx(v), x2: sx(v), y1: botTop, y2: botTop + botH }),
            el("text", { x: sx(v), y: H - B + 18, "text-anchor": "middle" }, fmt(v)),
        );
    }
    for (const v of ticks(0, emax, 3)) {
        grid.append(
            el("line", { x1: L, x2: W - R, y1: sye(v), y2: sye(v) }),
            el("text", { x: L - 8, y: sye(v) + 4, "text-anchor": "end", class: "err" }, fmt(v)),
        );
    }
    for (const v of [0, cap / 2, cap])
        grid.append(el("text", { x: W - R + 8, y: sys(v) + 4, class: "steps" }, String(v)));
    if (ymin < 0 && ymax > 0)
        grid.append(el("line", { x1: L, x2: W - R, y1: sy(0), y2: sy(0), class: "zero" }));

    const curves = group("curves");
    curves.append(
        el("path", { d: pathOf(points, sx, sy, (p) => p.target), class: "target" }),
        el("path", { d: pathOf(points, sx, sy, (p) => (p.failed ? NaN : p.out)), class: "out" }),
        el("path", { d: pathOf(points, sx, sys, (p) => p.steps), class: "steps" }),
        el("path", { d: pathOf(points, sx, sye, (p) => p.error), class: "err" }),
    );
    for (const p of points)
        if (p.failed)
            curves.append(
                el("line", { x1: sx(p.x), x2: sx(p.x), y1: T + topH - 10, y2: T + topH, class: "failed" }),
            );

    const labels = group("labels");
    labels.append(
        el("text", { x: L, y: T - 10, class: "target" }, "target"),
        el("text", { x: L + 60, y: T - 10, class: "out" }, "brain output"),
        el("text", { x: L + 160, y: T - 10, class: "failed" }, "| hit the step cap"),
        el("text", { x: L, y: botTop - 10, class: "err" }, "error (left axis)"),
        el("text", { x: L + 130, y: botTop - 10, class: "steps" }, "steps (right axis)"),
    );

    // Hover: the nearest sample's numbers.
    const hover = group("hover");
    hover.style.display = "none";
    const vline = el("line", { y1: T, y2: botTop + botH });
    const dot = el("circle", { r: 3.5 });
    const box = el("rect", { rx: 4, width: 200, height: 78 });
    const lines = [0, 1, 2, 3].map((i) => el("text", { y: 0 }));
    hover.append(vline, dot, box, ...lines);
    const catcher = svg.appendChild(
        el("rect", { x: L, y: T, width: W - L - R, height: botTop + botH - T, class: "catcher" }),
    );
    catcher.addEventListener("mousemove", (event) => {
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const { x } = pt.matrixTransform(svg.getScreenCTM().inverse());
        const i = Math.round(((x - L) / (W - L - R)) * (points.length - 1));
        const p = points[Math.max(0, Math.min(points.length - 1, i))];
        const px = sx(p.x);
        vline.setAttribute("x1", px);
        vline.setAttribute("x2", px);
        dot.style.display = p.failed ? "none" : "";
        dot.setAttribute("cx", px);
        dot.setAttribute("cy", sy(p.out));
        const bx = px > (L + W - R) / 2 ? px - 212 : px + 12;
        box.setAttribute("x", bx);
        box.setAttribute("y", T + 8);
        const text = [
            `x = ${fmt(p.x)}`,
            `f(x) = ${fmt(p.target)}`,
            p.failed ? "did not finish" : `output = ${fmt(p.out)}`,
            `${p.failed ? "" : `error ${fmt(p.error)}, `}${p.steps} steps`,
        ];
        lines.forEach((line, k) => {
            line.setAttribute("x", bx + 10);
            line.setAttribute("y", T + 8 + 18 * (k + 1));
            line.textContent = text[k];
        });
        hover.style.display = "";
    });
    catcher.addEventListener("mouseleave", () => {
        hover.style.display = "none";
    });
};

if (typeof document !== "undefined") {
    const $ = (id) => document.getElementById(id);
    const update = () => {
        const status = $("status");
        try {
            const settings = {
                min: +$("min").value,
                max: +$("max").value,
                samples: Math.max(2, Math.floor(+$("samples").value) || 2),
                cap: Math.max(1, Math.floor(+$("steps").value) || 1),
            };
            if (!(settings.max > settings.min)) throw new Error("“to” has to be above “from”");
            const { brain, points } = sample($("brain").value, $("target").value, settings);
            const s = summarize(points);
            status.className = "";
            status.textContent =
                `${brain.instructions.length} instructions, ${brain.startData.length} data cells. ` +
                `Mean error ${fmt(s.meanError)} over ${points.length - s.failed} finished runs` +
                (s.failed ? `, ${s.failed} hit the step cap` : "") +
                (s.worst.error >= 0 ? `. Worst ${fmt(s.worst.error)} at x = ${fmt(s.worst.x)}` : "") +
                `. ${fmt(s.meanSteps)} steps on average.`;
            draw($("graph"), points, settings.cap);
        } catch (error) {
            status.className = "error";
            status.textContent = String(error.message ?? error);
        }
    };

    let timer;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(update, 120);
    };
    for (const id of ["brain", "target", "min", "max", "samples", "steps"])
        $(id).addEventListener("input", schedule);
    $("file").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        $("brain").value = await file.text();
        update();
    });

    const start = new URLSearchParams(location.search).get("brain") ?? "brains/sin-1M-generations.txt";
    fetch(start)
        .then((response) => (response.ok ? response.text() : Promise.reject(response.statusText)))
        .then(
            (text) => {
                $("brain").value = text;
            },
            () => {
                $("brain").value = FALLBACK_BRAIN;
            },
        )
        .then(update);
}
