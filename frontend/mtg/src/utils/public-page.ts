import { ResponseError } from "src/api/generated";

/**
 * Whether a failed request means the thing is not on show
 *
 * The public endpoints answer the same way for "no such deck" and "that deck is
 * private", on purpose: telling the two apart would say whether a private deck
 * exists. Either way there is nothing for the page to render but a note.
 *
 * @param error what the request rejected with
 *
 * @returns whether the request failed because nothing is on show there
 */
export function isNotPublic(error: unknown): boolean {
    return error instanceof ResponseError && error.response.status === 400;
}
