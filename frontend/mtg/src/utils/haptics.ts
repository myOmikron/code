/**
 * The short buzz that tells a thumb a tap landed.
 *
 * A life counter is used without being looked at: four people reach across a
 * table and hit a tile while watching the board, not the phone. A pulse under
 * the finger is the only confirmation that arrives without taking their eyes
 * off the game.
 *
 * Desktops, iPhones and browsers with the setting turned off have no vibration
 * motor to offer, which is why nothing here reports failure.
 */

/** What a single counted tap feels like, in milliseconds */
const TAP = 10;

/** What an action that changes the whole table feels like */
const CONFIRM = [12, 60, 12];

/**
 * Buzzes once for a counted tap
 */
export function hapticTap(): void {
    buzz(TAP);
}

/**
 * Buzzes twice for something that resets or clears the table
 */
export function hapticConfirm(): void {
    buzz(CONFIRM);
}

/**
 * Asks the device for a pulse, where there is one to ask for
 *
 * @param pattern the pulse, or the alternating pulse and pause
 */
function buzz(pattern: number | Array<number>): void {
    if (typeof navigator.vibrate !== "function") return;
    try {
        navigator.vibrate(pattern);
    } catch {
        // A browser that lists the api and refuses it simply stays quiet.
    }
}
