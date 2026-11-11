import { mutateBrain, crossoverBrains } from "./AI.js";
import { randomGaussian } from "./utils.js";

/**
 * Population-level evolution for brains: reproduction with crossover and self-adapting mutation rates,
 * random newcomers, scoring, and a rank-weighted stochastic cut. Nothing here touches Node APIs, so it
 * is safe to import in the browser. The domain decides what a brain is for by supplying `newBrain`
 * (how to make a random one) and `score` (lower is better).
 */

/**
 * Mutation rates a brain carries and passes on. See `mutateBrain` for what each one does; all of them
 * are per element (per start-data cell or per instruction slot).
 */
export const DEFAULT_RATES = {
    data: 0.1,
    instruction: 0.1,
    structure: 0.02,
    rounding: 0.02,
    argument: 0.03,
};

// The most self-adaptation can push a rate up to; no rate can go below 0.
const RATE_MAX = { data: 10, instruction: 1, structure: 1, rounding: 1, argument: 1 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * A child's rates: each of the parent's rates shifted by adaptation * gaussian and kept between 0 and
 * its maximum, so a lineage tunes its own mutation rates along with everything else. The shift is
 * added, not multiplied, on purpose: a rate that has fallen to 0 (no mutation of that kind) is still one
 * or two steps away from a useful value, where a multiplicative step would strand it near 0 for hundreds
 * of generations. An adaptation of 0 keeps the rates fixed.
 */
export const adaptRates = (rates, adaptation) =>
    Object.fromEntries(
        Object.entries(rates).map(([name, rate]) => [
            name,
            clamp(
                rate + adaptation * randomGaussian(),
                0,
                RATE_MAX[name] ?? Infinity,
            ),
        ]),
    );

/** Rates for a crossover child: the average of both parents'. */
export const mixRates = (a, b) =>
    Object.fromEntries(
        Object.keys(a).map((name) => [name, (a[name] + b[name]) / 2]),
    );

/**
 * Survival odds by rank for a scored pool of `n` cut to `count`: the best always survives, the worst
 * survives `worstSurvival` of the time, and the odds fall off smoothly in between. A straight line would
 * not sum to `count`, so it is bent just enough: odds[i] = w + (1 - w) * (1 - i / (n - 1)) ** gamma,
 * with gamma found by bisection (the sum falls as gamma rises).
 */
export const survivalOdds = (n, count, worstSurvival) => {
    if (count >= n) return Array(n).fill(1);
    const odds = (gamma) =>
        Array.from(
            { length: n },
            (_, i) =>
                worstSurvival + (1 - worstSurvival) * (1 - i / (n - 1)) ** gamma,
        );
    let low = 0;
    let high = 64;
    for (let k = 0; k < 60; k++) {
        const mid = (low + high) / 2;
        if (odds(mid).reduce((a, b) => a + b, 0) > count) low = mid;
        else high = mid;
    }
    return odds((low + high) / 2);
};

/**
 * Stochastic cut with exact odds: lay the odds end to end and take every brain whose stretch contains
 * one of the evenly spaced points u, u+1, u+2, ... (systematic sampling). Each brain survives with
 * exactly its odds, and exactly `count` survive because the odds sum to `count`.
 * @param {Brain[]} sorted The pool, best first.
 */
export const selectSurvivors = (sorted, count, worstSurvival) => {
    const odds = survivalOdds(sorted.length, count, worstSurvival);
    const survivors = [];
    let cumulative = 0;
    let point = Math.random();
    sorted.forEach((brain, i) => {
        cumulative += odds[i];
        if (cumulative > point) {
            survivors.push(brain);
            point += 1;
        }
    });
    // floating-point slack can leave one short; top up with the best brain not yet taken
    for (const brain of sorted) {
        if (survivors.length >= count) break;
        if (!survivors.includes(brain)) survivors.push(brain);
    }
    return survivors.sort((a, b) => a.score - b.score);
};

/**
 * Create a population.
 * @param {Object} options
 * @param {Function} options.newBrain Makes a random brain; used for the first generation, resets and newcomers.
 * @param {Function} options.score Scores a brain (lower is better). Called on every brain in the pool each step.
 * @param {Number} [options.size=50] Survivors kept each generation.
 * @param {Object} [options.rates=DEFAULT_RATES] Mutation rates every fresh brain starts with.
 * @param {Number} [options.rateAdaptation=0.05] Size of the random shift a child's rates get from its parent's (added to each rate, clamped at 0); 0 fixes them.
 * @param {Number} [options.crossoverRate=0.5] Fraction of children that start as a cross with a random other survivor.
 * @param {Number} [options.randomSeeds=1] Fresh random brains added to every generation's pool.
 * @param {Number} [options.worstSurvival=0.03] Survival odds of the worst brain in the pool; the best always survives.
 * @returns {Population} with `brains` (best first once scored), `generation`, `best`, `step()` and `reset()`.
 */
export const newPopulation = (options) => {
    const opts = {
        size: 50,
        rates: DEFAULT_RATES,
        rateAdaptation: 0.05,
        crossoverRate: 0.5,
        randomSeeds: 1,
        worstSurvival: 0.03,
        ...options,
    };
    if (typeof opts.newBrain !== "function" || typeof opts.score !== "function")
        throw new Error("newPopulation needs newBrain() and score(brain)");

    const fresh = (count) =>
        Array.from({ length: count }, () =>
            Object.assign(opts.newBrain(), { rates: { ...opts.rates } }),
        );

    const population = {
        options: opts,
        brains: fresh(opts.size),
        generation: 0,

        /** The best brain, once at least one generation has been scored. */
        get best() {
            return population.brains[0];
        },

        /**
         * One generation: every survivor gets one child (a mutated copy, or a mutated cross with a random
         * other survivor), newcomers join, everything is scored, and the rank lottery picks the survivors.
         * @returns {Brain} The best brain.
         */
        step() {
            const survivors = population.brains;
            const children = survivors.map((brain) => {
                const mate =
                    survivors[Math.floor(Math.random() * survivors.length)];
                const crossed = Math.random() < opts.crossoverRate;
                const parent = crossed ? crossoverBrains(brain, mate) : brain;
                const rates = adaptRates(
                    crossed ? mixRates(brain.rates, mate.rates) : brain.rates,
                    opts.rateAdaptation,
                );
                const child = mutateBrain(
                    parent,
                    rates.data,
                    rates.instruction,
                    rates.structure,
                    rates.rounding,
                    rates.argument,
                );
                child.rates = rates;
                return child;
            });

            const pool = survivors.concat(children, fresh(opts.randomSeeds));
            pool.forEach((brain) => {
                brain.score = opts.score(brain);
            });
            pool.sort((a, b) => a.score - b.score);
            population.brains = selectSurvivors(pool, opts.size, opts.worstSurvival);
            population.generation++;
            return population.best;
        },

        /** Throw the population away and start again from random brains. */
        reset() {
            population.brains = fresh(opts.size);
            population.generation = 0;
        },
    };
    return population;
};
