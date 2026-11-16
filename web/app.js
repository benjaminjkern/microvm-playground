import { parseBrainFile, formatBrainFile } from "../modules/brainFile.js";
import {
    compileTarget,
    sample,
    summarize,
    drawFunction,
    drawHistory,
    fmt,
} from "./chart.js";
import { newPlayground } from "./playground.js";

/**
 * The frontend of the evolution harness (served by test/testAI.js, see test/server.js). Two tabs over one
 * graph and one playground:
 *   - Live best: the run in progress, pushed by the server, and its current best brain;
 *   - Loaded brain: a saved brain, or any brain pasted in, to edit and save back to brains/.
 * Whichever brain the tab shows is drawn against the target and can be stepped through below.
 *
 * Without the harness (any static server, say `python3 -m http.server` in the repo root) the Loaded tab
 * still works: there is no list of saved brains, and saving downloads the file instead.
 * `?tab=loaded` opens on that tab; `?brain=brains/some.txt` loads that file into it.
 */

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const message = (error) => String(error?.message ?? error);

// ---- state ---------------------------------------------------------------------------------------------

let tab = null; // "live" or "loaded"; null until we know whether there is a server
let server = null; // the latest state the server sent
let serverSettings = ""; // the target, range and step cap last copied from the server into the controls
let markerX; // the input being stepped through, marked on the graph
// The brain the Live tab shows: the current best, or the one it was showing when a run was started in the
// playground (pinned, so it does not change underfoot).
const live = { text: "", brain: null, generation: 0, run: 0, pinned: false };
// The brain the Loaded tab shows. The textarea holds its text; `saved` is that text as last saved or
// loaded (null if it never was); `brain` is the last version that parsed, `error` why the text does not,
// and `note` something to tell the user (saved, could not load) until the next change.
const loaded = { brain: null, notes: [], saved: null, name: "", error: "", note: "" };
let currentText = ""; // the textarea as of the last change we handled, for undo
const undo = [];
let lastChangeAt = 0;

// ---- the graph and the playground ----------------------------------------------------------------------

const settings = () => ({
    source: $("target").value,
    min: Number($("min").value),
    max: Number($("max").value),
    samples: Math.max(2, Math.floor(Number($("samples").value)) || 2),
    cap: Math.max(1, Math.floor(Number($("steps").value)) || 1),
});
const targetOrNothing = () => {
    try {
        return compileTarget($("target").value);
    } catch {
        return undefined;
    }
};
const shown = () => (tab === "live" ? live.brain : loaded.brain);

const redraw = () => {
    const status = $("status");
    const brain = shown();
    status.className = "";
    if (!brain) {
        $("graph").replaceChildren();
        status.textContent =
            tab === "loaded"
                ? "No brain loaded."
                : server
                  ? "Waiting for the first scored generation."
                  : "No run to show.";
        return;
    }
    try {
        const s = settings();
        if (!(s.max > s.min)) throw new Error("“To” has to be above “From”");
        const points = sample(brain, compileTarget(s.source), s);
        const sum = summarize(points);
        status.textContent =
            `${brain.instructions.length} instructions, ${brain.startData.length} data cells. ` +
            `Mean error ${fmt(sum.meanError)} over ${points.length - sum.failed} finished runs` +
            (sum.failed ? `, ${sum.failed} hit the step cap` : "") +
            (sum.worst.error >= 0 ? `. Worst ${fmt(sum.worst.error)} at x = ${fmt(sum.worst.x)}` : "") +
            `. ${fmt(sum.meanSteps)} steps on average.`;
        drawFunction($("graph"), points, s.cap, {
            markerX,
            onPick: (x) => playground.start(x),
        });
    } catch (error) {
        status.className = "error";
        status.textContent = message(error);
    }
};

const playground = newPlayground($("playground"), {
    onEdit: () => {
        // an edit made in the playground: the text follows the brain
        const text = formatBrainFile(loaded.notes, loaded.brain);
        commit(text);
        $("brain").value = text;
        loaded.error = "";
        renderLoaded();
        redraw();
    },
    onStart: (x) => {
        markerX = x;
        if (tab === "live" && live.brain && !live.pinned) {
            live.pinned = true;
            renderPin();
        }
        redraw();
    },
});
const showBrain = (keepRun = false) =>
    playground.show(shown(), {
        editable: tab === "loaded",
        target: targetOrNothing(),
        cap: settings().cap,
        keepRun,
    });

const setTab = (name) => {
    tab = name;
    for (const each of ["live", "loaded"]) {
        $(`tab-${each}`).setAttribute("aria-selected", String(each === name));
        $(`${each}-panel`).hidden = each !== name;
    }
    markerX = undefined;
    showBrain();
    redraw();
};

// ---- the Live tab ----------------------------------------------------------------------------------------

const setConnection = (on) => {
    $("connection").textContent = on ? "live" : "no server";
    $("connection").className = on ? "on" : "off";
    for (const id of ["restart", "save-best"]) $(id).disabled = !on;
};

const renderPin = () => {
    $("pin-note").textContent = !live.brain
        ? ""
        : live.pinned
          ? `Showing the best of generation ${live.generation.toLocaleString("en-US")}, held still while you step through it.`
          : "Showing the current best; it changes as the run finds better ones.";
    $("follow").hidden = !live.pinned;
    $("edit-copy").disabled = !live.brain;
    $("live-brain").textContent = live.text;
};

const renderLive = (state) => {
    const best = state.best;
    $("stat-generation").textContent = state.generation.toLocaleString("en-US");
    $("stat-run").textContent = `run ${state.run}${state.startFile ? `, from ${state.startFile}` : ""}`;
    $("stat-speed").textContent = fmt(state.generationsPerSecond, 3);
    $("stat-error").textContent = best ? fmt(best.error) : "–";
    $("stat-score").textContent = best
        ? `score ${fmt(best.score)}, on this generation's ${state.testsPerGeneration} inputs`
        : "not scored yet";
    $("stat-size").textContent = best ? `${best.instructions} + ${best.data}` : "–";
    $("stat-steps").textContent = best ? fmt(best.steps) : "–";
    $("stat-rates").textContent = best
        ? Object.entries(best.rates)
              .map(([name, rate]) => `${name} ${rate.toFixed(3)}`)
              .join("  ")
        : "–";
    $("islands").replaceChildren(
        ...state.islands.map((island, i) => {
            const chip = document.createElement("span");
            const isBest = island && best && island.score === best.score;
            chip.className = `chip${isBest ? " best" : ""}${island && island.error >= state.penaltyGate ? " above" : ""}`;
            chip.textContent = island ? `${fmt(island.error, 3)}/${island.instructions}` : "–";
            chip.title = island
                ? `Island ${i}: error ${fmt(island.error)}, score ${fmt(island.score)}, ${island.instructions} instructions, ${island.data} data cells, ${fmt(island.steps)} steps` +
                  (island.error >= state.penaltyGate ? " (above the penalty gate)" : "")
                : `Island ${i}: not scored yet`;
            return chip;
        }),
    );
    drawHistory($("history"), state.history, {
        floor: state.constantFloor,
        gate: state.penaltyGate,
    });
};

// Take the server's current best as the brain the Live tab shows.
const takeBest = (state) => {
    if (!state.best || state.best.brain === live.text) return false;
    try {
        live.brain = parseBrainFile(state.best.brain).brain;
    } catch (error) {
        $("live-status").textContent = `The server's best brain does not parse: ${message(error)}`;
        return false;
    }
    Object.assign(live, { text: state.best.brain, generation: state.generation, run: state.run });
    return true;
};

const onState = (state) => {
    server = state;
    setConnection(true);
    // The run's own target, range and step cap go into the controls when they first arrive or change.
    const key = `${state.target}|${state.range}|${state.stepsPerRun}`;
    const settingsChanged = key !== serverSettings;
    if (settingsChanged) {
        serverSettings = key;
        $("target").value = state.target;
        $("min").value = -state.range;
        $("max").value = state.range;
        $("steps").value = state.stepsPerRun;
    }
    renderLive(state);
    const changed = !live.pinned && takeBest(state);
    if (changed) renderPin();
    if (tab === null) return setTab("live");
    if (tab === "live" && changed) {
        showBrain();
        redraw();
    } else if (settingsChanged) {
        playground.configure({ target: targetOrNothing(), cap: settings().cap });
        redraw();
    }
};

const follow = () => {
    live.pinned = false;
    markerX = undefined;
    if (server) takeBest(server);
    renderPin();
    showBrain();
    redraw();
};

const post = async (path) => {
    const response = await fetch(path, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? `The server said ${response.status}`);
    return result;
};

// ---- the Loaded tab --------------------------------------------------------------------------------------

const isDirty = () => $("brain").value !== "" && $("brain").value !== loaded.saved;

const renderLoaded = () => {
    $("dirty").hidden = !isDirty();
    $("undo").disabled = undo.length === 0;
    $("loaded-status").className = loaded.error ? "error" : "";
    $("loaded-status").textContent = [
        loaded.note,
        loaded.error &&
            `The text is not a brain: ${loaded.error}.` +
                (loaded.brain ? " Showing the last version that was." : ""),
    ]
        .filter(Boolean)
        .join(" ");
};
const say = (text) => {
    loaded.note = text;
    renderLoaded();
};

// Remember the text as it was, so Undo can go back to it. A burst of changes (typing, holding an arrow
// key on a number) is one step back, not one per keystroke.
const commit = (text) => {
    if (text === currentText) return;
    loaded.note = "";
    const now = Date.now();
    if (now - lastChangeAt > 600) {
        undo.push(currentText);
        if (undo.length > 200) undo.shift();
    }
    lastChangeAt = now;
    currentText = text;
};

// The textarea changed (typed in, or set by us): read it as a brain and show it.
const readText = (keepRun) => {
    try {
        const { notes, brain } = parseBrainFile($("brain").value);
        Object.assign(loaded, { notes, brain, error: "" });
    } catch (error) {
        loaded.error = message(error);
    }
    renderLoaded();
    if (tab !== "loaded") return;
    // text that does not parse leaves the last good version on show, if there is one
    if (!loaded.error || !loaded.brain) showBrain(keepRun);
    redraw();
};

// Put a different brain in the Loaded tab.
const open = (text, name, saved = null) => {
    Object.assign(loaded, { brain: null, notes: [], saved, name, error: "", note: "" });
    undo.length = 0;
    lastChangeAt = 0;
    currentText = text;
    $("brain").value = text;
    // the notes come first and can be long: start at the end, where the brain's own three lines are
    $("brain").scrollTop = $("brain").scrollHeight;
    $("name").value = name;
    markerX = undefined;
    readText(false);
};

const discardOk = () =>
    !isDirty() || confirm(`Discard the unsaved changes to ${loaded.name || "this brain"}?`);

const refreshSaved = async (select) => {
    let list;
    try {
        const response = await fetch("/api/brains");
        if (!response.ok) throw new Error();
        list = await response.json();
    } catch {
        $("saved").replaceChildren(new Option("only with the harness running", ""));
        $("saved").disabled = true;
        return [];
    }
    $("saved").disabled = false;
    $("saved").replaceChildren(
        new Option(list.length ? "choose…" : "none yet", ""),
        ...list.map(({ name }) => new Option(name, name)),
    );
    $("saved").value = list.some(({ name }) => name === select) ? select : "";
    return list;
};

const fetchText = async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.text();
};

const openSaved = async (name) => {
    try {
        const text = await fetchText(`/brains/${encodeURIComponent(name)}`);
        open(text, name, text);
        $("saved").value = name;
    } catch (error) {
        say(`Could not load ${name}: ${message(error)}`);
    }
};

const download = (name, text) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
};

const fileName = () => {
    let name = $("name").value.trim();
    if (!name) return "";
    if (!name.endsWith(".txt")) name += ".txt";
    $("name").value = name;
    return name;
};

const save = async (overwrite) => {
    const name = fileName();
    if (!name) return say("Give it a name to save it under.");
    if (loaded.error) return say("Not saved.");
    const text = $("brain").value;
    let response;
    try {
        response = await fetch(
            `/api/brains/${encodeURIComponent(name)}${overwrite ? "?overwrite=1" : ""}`,
            { method: "PUT", body: text },
        );
    } catch {
        response = null;
    }
    // no harness behind this page (a plain static server answers 404, 405 or 501 to a PUT)
    if (!response || [404, 405, 501].includes(response.status)) {
        download(name, text);
        return say("The harness is not running, so the browser downloaded the file instead of saving it to brains/.");
    }
    if (response.status === 409) {
        if (confirm(`${name} already exists in brains/. Replace it?`)) return save(true);
        return say("Not saved.");
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return say(`Not saved: ${result.error ?? response.status}`);
    Object.assign(loaded, { saved: text, name });
    await refreshSaved(name);
    say(`Saved to brains/${name}.`);
};

// ---- wiring ----------------------------------------------------------------------------------------------

$("tab-live").addEventListener("click", () => setTab("live"));
$("tab-loaded").addEventListener("click", () => setTab("loaded"));

let settingsTimer;
for (const id of ["target", "min", "max", "samples", "steps"])
    $(id).addEventListener("input", () => {
        clearTimeout(settingsTimer);
        settingsTimer = setTimeout(() => {
            playground.configure({ target: targetOrNothing(), cap: settings().cap });
            redraw();
        }, 150);
    });

$("follow").addEventListener("click", follow);
$("edit-copy").addEventListener("click", () => {
    if (!live.brain || !discardOk()) return;
    const text = [
        `# The best of generation ${live.generation} in run ${live.run}, copied from the live run on ${new Date().toISOString().slice(0, 10)}.`,
        ...(server ? [`# Target ${server.target} on ±${server.range}.`] : []),
        live.text,
        "",
    ].join("\n");
    open(text, `best-gen-${live.generation}.txt`);
    $("saved").value = "";
    setTab("loaded");
});
$("save-best").addEventListener("click", async () => {
    try {
        const { name } = await post("/api/save-best");
        $("live-status").textContent = `Saved the current best to brains/${name}.`;
        refreshSaved($("saved").value);
    } catch (error) {
        $("live-status").textContent = message(error);
    }
});
$("restart").addEventListener("click", async () => {
    if (!confirm("Throw the whole population away and start the run again?")) return;
    try {
        onState(await post("/api/reset"));
        $("live-status").textContent = "Restarted.";
        if (!live.pinned) {
            // nothing is scored yet: stop showing the old run's best
            Object.assign(live, { text: "", brain: null });
            renderPin();
            if (tab === "live") {
                showBrain();
                redraw();
            }
        }
    } catch (error) {
        $("live-status").textContent = message(error);
    }
});

$("brain").addEventListener("input", () => {
    commit($("brain").value);
    readText(true);
});
$("undo").addEventListener("click", () => {
    if (!undo.length) return;
    currentText = undo.pop();
    lastChangeAt = 0;
    $("brain").value = currentText;
    readText(true);
});
$("saved").addEventListener("change", (event) => {
    const name = event.target.value;
    if (!name) return;
    if (!discardOk()) return void (event.target.value = loaded.saved === null ? "" : loaded.name);
    openSaved(name);
});
$("file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || !discardOk()) return;
    open(await file.text(), file.name);
    $("saved").value = "";
});
$("save").addEventListener("click", () =>
    // saving back over the file this came from needs no asking
    save(loaded.saved !== null && fileName() === loaded.name),
);
$("download").addEventListener("click", () => {
    const name = fileName();
    if (!name) return say("Give it a name to download it as.");
    download(name, $("brain").value);
});
window.addEventListener("beforeunload", (event) => {
    if (isDirty()) event.preventDefault();
});

// ---- start -----------------------------------------------------------------------------------------------

const start = async () => {
    setConnection(false);
    $("connection").textContent = "connecting…";
    renderPin();
    renderLoaded();
    if (params.get("tab") === "loaded" || params.has("brain")) setTab("loaded");

    // The run, if there is a harness behind this page. EventSource reconnects by itself when the
    // harness is restarted; against a plain static server it fails once and stays closed.
    const events = new EventSource("/api/events");
    events.onmessage = (event) => onState(JSON.parse(event.data));
    events.onerror = () => {
        setConnection(false);
        if (tab === null) setTab("loaded");
    };

    // Something to look at in the Loaded tab: the brain asked for, or the most recently saved one.
    const list = await refreshSaved("");
    const asked = params.get("brain");
    try {
        if (asked) {
            const text = await fetchText(`/${asked.replace(/^\/+/, "")}`);
            const name = asked.split("/").pop();
            open(text, name, text);
            $("saved").value = list.some((each) => each.name === name) ? name : "";
        } else if (list.length) await openSaved(list[0].name);
        else {
            const text = await fetchText("/brains/sin-1M-generations.txt");
            open(text, "sin-1M-generations.txt", text);
        }
    } catch (error) {
        say(asked ? `Could not load ${asked}: ${message(error)}` : "Paste a brain below, or open a file.");
    }
};
start();
