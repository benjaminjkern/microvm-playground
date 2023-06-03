const MAX_UPDATES_PER_FRAME = 30000;

export const playArea = { width: 500, height: 500 };

export let paused = false;
export let updatesPerFrame = 1;
export let manualPlayMode = false;
export let t;

export const keysDown = {};

export const restartScene = () => {
    t = 0;
};

export const updateTime = () => {
    t++;
};

export const togglePause = () => {
    paused = !paused;
    return paused;
};

export const toggleFastMode = () => {
    updatesPerFrame = MAX_UPDATES_PER_FRAME + 1 - updatesPerFrame;
};

export const toggleManualPlayMode = () => {
    manualPlayMode = !manualPlayMode;
};

export const getManualBotInputs = () => {
    return [
        (keysDown["ArrowUp"] || 0) - (keysDown["ArrowDown"] || 0),
        0.025 * ((keysDown["ArrowRight"] || 0) - (keysDown["ArrowLeft"] || 0)),
        keysDown[" "] || 0,
        keysDown["Shift"] || 0,
    ];
};

export const setKeyDown = (key, value) => {
    keysDown[key] = value;
};
