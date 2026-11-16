import { copyBrain, runBrain, resetBrain } from "../modules/AI.js";

/**
 * The frontend's charts, as SVG: a brain's output against its target with the error and the steps below
 * (`drawFunction`), and the best error over the generations of a run (`drawHistory`). `sample`,
 * `summarize` and `compileTarget` have no DOM in them, so they can be tested from Node.
 */

export const fmt = (v, digits = 4) =>
    Number.isFinite(v) ? String(+v.toPrecision(digits)) : String(v);

/**
 * The target as a function, from what the harness reports (`f.toString()`, an arrow function) or from
 * what someone types: an arrow function, or just an expression in x such as `Math.sin(x)`.
 */
export const compileTarget = (source) => {
    const text = source.trim();
    if (!text) throw new Error("There is no target function");
    let f;
    try {
        f = /=>|^function\b/.test(text)
            ? new Function(`return (${text});`)()
            : new Function("x", `return (${text});`);
    } catch (error) {
        throw new Error(`The target is not JavaScript that runs: ${error.message}`);
    }
    if (typeof f !== "function") throw new Error("The target is not a function of x");
    return f;
};

/**
 * Run a brain over an evenly spaced range of inputs, as test/testAI.js scores it: a run that uses every
 * step it is given never finished and counts as failed. Runs a copy, so the brain itself is not touched.
 * @returns {{ x, out, target, steps, failed, error }[]}
 */
export const sample = (brain, target, { min, max, samples, cap }) => {
    const runner = copyBrain(brain);
    const points = [];
    for (let i = 0; i < samples; i++) {
        const x = min + ((max - min) * i) / (samples - 1);
        resetBrain(runner);
        runner.inputData[0] = x;
        const steps = runBrain(runner, cap);
        const out = runner.outputData[0];
        const expected = Number(target(x));
        const failed = steps >= cap || !Number.isFinite(out);
        points.push({
            x,
            out,
            target: expected,
            steps,
            failed,
            error: failed ? NaN : Math.abs(expected - out),
        });
    }
    return points;
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

// ---- drawing -------------------------------------------------------------------------------------------

const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, text) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
};

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

/**
 * Target against output on top, error and steps below, with the numbers of the nearest sample on hover.
 * @param {SVGElement} svg Emptied and redrawn.
 * @param {Object[]} points From `sample`.
 * @param {Number} cap The step cap, for the steps axis.
 * @param {Object} [options]
 * @param {Number} [options.markerX] An input to mark with a vertical line (the one being traced).
 * @param {Function} [options.onPick] Called with the x of the sample that was clicked.
 */
export const drawFunction = (svg, points, cap, { markerX, onPick } = {}) => {
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
    const tmin = targets.length ? Math.min(...targets) : 0;
    const tmax = targets.length ? Math.max(...targets) : 1;
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
    if (Number.isFinite(markerX) && markerX >= xmin && markerX <= xmax)
        curves.append(
            el("line", { x1: sx(markerX), x2: sx(markerX), y1: T, y2: botTop + botH, class: "marker" }),
            el("text", { x: sx(markerX) + 5, y: T + 12, class: "marker" }, `x = ${fmt(markerX)}`),
        );

    const labels = group("labels");
    labels.append(
        el("text", { x: L, y: T - 10, class: "target" }, "target"),
        el("text", { x: L + 60, y: T - 10, class: "out" }, "brain output"),
        el("text", { x: L + 160, y: T - 10, class: "failed" }, "| hit the step cap"),
        el("text", { x: L, y: botTop - 10, class: "err" }, "error (left axis)"),
        el("text", { x: L + 130, y: botTop - 10, class: "steps" }, "steps (right axis)"),
    );
    if (onPick)
        labels.append(
            el("text", { x: W - R, y: T - 10, "text-anchor": "end" }, "click a point to step through it below"),
        );

    // Hover: the nearest sample's numbers.
    const hover = group("hover");
    hover.style.display = "none";
    const vline = el("line", { y1: T, y2: botTop + botH });
    const dot = el("circle", { r: 3.5 });
    const box = el("rect", { rx: 4, width: 200, height: 78 });
    const lines = [0, 1, 2, 3].map(() => el("text", { y: 0 }));
    hover.append(vline, dot, box, ...lines);
    const catcher = svg.appendChild(
        el("rect", {
            x: L, y: T, width: W - L - R, height: botTop + botH - T,
            class: onPick ? "catcher pick" : "catcher",
        }),
    );
    const nearest = (event) => {
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const { x } = pt.matrixTransform(svg.getScreenCTM().inverse());
        const i = Math.round(((x - L) / (W - L - R)) * (points.length - 1));
        return points[Math.max(0, Math.min(points.length - 1, i))];
    };
    catcher.addEventListener("mousemove", (event) => {
        const p = nearest(event);
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
    if (onPick)
        catcher.addEventListener("click", (event) => onPick(+nearest(event).x.toPrecision(6)));
};

/**
 * The best error over the generations of a run, on a log scale, with the two levels that matter to the
 * scoring drawn across it: the best constant's error and the gate below which the penalties fade in.
 * @param {SVGElement} svg Emptied and redrawn.
 * @param {Number[][]} history [generation, error] pairs, oldest first.
 * @param {Object} [levels] `floor` and `gate`, both errors.
 */
export const drawHistory = (svg, history, { floor, gate } = {}) => {
    svg.replaceChildren();
    const W = 960;
    const H = 170;
    const L = 64;
    const R = 60;
    const T = 16;
    const B = 28;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!history || history.length < 2) {
        svg.append(
            el("text", { x: W / 2, y: H / 2, "text-anchor": "middle" }, "The best error over the generations appears here once there are a few"),
        );
        return;
    }
    const levels = [
        [floor, "best constant"],
        [gate, "penalties fade in below"],
    ].filter(([value]) => Number.isFinite(value) && value > 0);
    // Nothing is drawn below a millionth of the constant's error: a perfect brain sits on the bottom edge.
    const tiny = Math.max(1e-12, (Number.isFinite(floor) ? floor : 1) * 1e-6);
    const log = (e) => Math.log10(Math.max(tiny, e));
    const gmin = history[0][0];
    const gmax = history[history.length - 1][0];
    let low = Math.min(...history.map(([, e]) => log(e)));
    let high = Math.max(...history.map(([, e]) => log(e)), ...levels.map(([value]) => log(value)));
    if (high - low < 0.3) {
        const middle = (high + low) / 2;
        low = middle - 0.15;
        high = middle + 0.15;
    }
    const pad = (high - low) * 0.1;
    low -= pad;
    high += pad;
    const sx = (g) => L + ((g - gmin) / (gmax - gmin || 1)) * (W - L - R);
    const sy = (e) => T + ((high - log(e)) / (high - low)) * (H - T - B);

    const grid = svg.appendChild(el("g", { class: "grid" }));
    let yTicks = [];
    for (let k = Math.floor(low); k <= Math.ceil(high); k++)
        for (const m of [1, 2, 5]) {
            const value = m * 10 ** k;
            if (Math.log10(value) >= low && Math.log10(value) <= high)
                yTicks.push({ value, major: m === 1 });
        }
    if (yTicks.length > 7) yTicks = yTicks.filter((tick) => tick.major);
    for (const { value } of yTicks)
        grid.append(
            el("line", { x1: L, x2: W - R, y1: sy(value), y2: sy(value) }),
            el("text", { x: L - 8, y: sy(value) + 4, "text-anchor": "end" }, fmt(value, 2)),
        );
    for (const g of ticks(gmin, gmax, 8))
        grid.append(
            el("line", { x1: sx(g), x2: sx(g), y1: T, y2: H - B }),
            el("text", { x: sx(g), y: H - B + 16, "text-anchor": "middle" }, g.toLocaleString("en-US")),
        );

    const curves = svg.appendChild(el("g", { class: "curves" }));
    for (const [value, label] of levels)
        curves.append(
            el("line", { x1: L, x2: W - R, y1: sy(value), y2: sy(value), class: "level" }),
            el("text", { x: W - R - 6, y: sy(value) - 4, "text-anchor": "end", class: "level" }, `${label} (${fmt(value, 3)})`),
        );
    curves.append(
        el("path", {
            d: history
                .map(([g, e], i) => `${i ? "L" : "M"}${sx(g).toFixed(1)},${sy(e).toFixed(1)}`)
                .join(""),
            class: "out",
        }),
    );
    svg.appendChild(el("g", { class: "labels" })).append(
        el("text", { x: L, y: T - 4, class: "out" }, "best error by generation (log scale)"),
    );
};
