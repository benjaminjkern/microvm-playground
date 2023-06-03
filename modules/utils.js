export const DEBUG = false;

export const forceFinite = (x) => {
    if (Number.isFinite(x)) return x;
    return 0;
};

export const randomColor = (color, mutation = 1) => {
    if (!color) return `#${Math.random().toString(16).substring(2, 8)}`;
    const rgb = [
        parseInt(color.substring(1, 3), 16),
        parseInt(color.substring(3, 5), 16),
        parseInt(color.substring(5, 7), 16),
    ];
    while (Math.random() > 0.01) {
        const r = Math.floor(Math.random() * 3);
        rgb[r] = Math.max(
            0,
            Math.min(
                255,
                rgb[r] +
                    (Math.floor(Math.random() * (mutation * 2 + 1)) - mutation)
            )
        );
    }
    return `#${rgb.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
};

/**
 * Helper math function.
 * @returns {Number} A random gaussian number.
 */
export const randomGaussian = () => {
    return (Math.random() > 0.5 ? 1 : -1) * Math.sqrt(-Math.log(Math.random()));
};

export const inRange = (a, b, c) => (c >= a && c <= b) || (c >= b && c <= a);
