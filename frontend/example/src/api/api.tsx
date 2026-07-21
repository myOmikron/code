import { ERROR_STORE } from "src/context/error-context";
import { Configuration, RequiredError, ResponseError } from "src/api/generated";

/** Hyphen separated uuid */
export type UUID = string;

// TODO: pass to DefaultApi once the generated client exists
const _configuration = new Configuration({
    basePath: window.location.origin,
});

// TODO: uncomment once the generated API is ready
// const defaultApi = new DefaultApi(configuration);

export const Api = {};

/**
 * Wraps a promise returned by the generated SDK which handles its errors and returns a {@link Result}
 *
 * @param promise The promise to wrap. This should be a promise defined in the generated part of the API
 *
 * @returns a new promise with a result that wraps errors from the API
 */
export async function handleError<T>(promise: Promise<T>): Promise<T> {
    try {
        return await promise;
    } catch (e) {
        let msg;
        if (e instanceof ResponseError) {
            if (e.response.status === 401) {
                msg = e.response.statusText;
                if (!msg) msg = "Unauthorized";
            } else {
                try {
                    const err = await e.response.json();
                    msg = `${e.response.statusText}. TraceId: ${err.trace_id}`;
                } catch {
                    console.error("Got invalid json", e.response.body);
                    msg = `${e.response.statusText}. The server's response was invalid json.`;
                }
            }
        } else if (e instanceof RequiredError) {
            console.error(e);
            msg = "The server's response didn't match the spec";
        } else {
            console.error("Unknown error occurred:", e);
            msg = "Unknown error occurred";
        }
        ERROR_STORE.report(msg);
        throw msg;
    }
}
