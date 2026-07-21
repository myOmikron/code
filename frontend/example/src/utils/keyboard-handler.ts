/** Helper to handle Ctrl-S and ESC globally */

import React from "react";

/**
 * Represents a generic event handler function which operates on a specific type of event
 * in the Document Object Model (DOM).
 *
 * @template Key - The type of the event key from `DocumentEventMap` that specifies the event this handler processes.
 * @template Return - The return type of the handler function. Defaults to `void`.
 * @param event - The event object associated with the specified `Key` from `DocumentEventMap`.
 * @returns The handler can optionally return a value of type `Return`.
 */
export type Handler<Key extends keyof DocumentEventMap, Return = void> = (event: DocumentEventMap[Key]) => Return;

/**
 * A global event handler
 */
export class GlobalEventHandler<Key extends keyof DocumentEventMap> {
    protected readonly key: Key;
    protected readonly handler: Handler<Key>;

    protected handlers: Array<{
        /** Handler key */
        key: symbol;
        /** The handler itself */
        handler: Handler<Key>;
    }> = [];

    // eslint-disable-next-line
    constructor(key: Key, filter: Handler<Key, boolean>) {
        this.key = key;
         
        this.handler = (event) => {
            if (filter(event) && this.handlers.length > 0) {
                event.preventDefault();
                this.handlers[this.handlers.length - 1].handler(event);
            }
        };

        this.attach();
    }

    /**
     * Register a new handler
     *
     * @param handler the handler function
     * @returns an id to remove the handler later-on
     */
    pushHandler(handler: (event: DocumentEventMap[Key]) => void): symbol {
        const key = Symbol();
        this.handlers.push({ key, handler });
        return key;
    }

    /**
     * Remove registered handler
     *
     * @param key The key to remove the handler
     * @returns An optional handler
     */
    removeHandler(key: symbol): Handler<Key> | undefined {
        const index = this.handlers.findLastIndex((item) => item.key === key);
        if (index === -1) return undefined;
        else return this.handlers.splice(index, 1)[0].handler;
    }

    /** Resume handling events */
    attach() {
        document.addEventListener(this.key, this.handler);
    }

    /** Pause handling events */
    detach() {
        document.removeEventListener(this.key, this.handler);
    }
}

/**
 * Hook to push a global event handler
 *
 * @param global The global event handler
 * @param handler an handler
 */
export function useGlobalHandler<Key extends keyof DocumentEventMap>(
    global: GlobalEventHandler<Key>,
    handler: Handler<Key> | null,
) {
    React.useEffect(() => {
        if (handler === null) return;

        const key = global.pushHandler(handler);
        return () => {
            global.removeHandler(key);
        };
    }, [global, handler]);
}

export const CTRL_S = new GlobalEventHandler("keydown", (event) => event.ctrlKey && event.key === "s");
