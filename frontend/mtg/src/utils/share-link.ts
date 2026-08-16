import { ResponseError } from "src/api/generated";

/**
 * What a share link points at.
 *
 * The kind is part of the link because the token is a secret on the row it
 * unlocks: resolving one takes the table it was minted in. Decks and want lists
 * join this list once they carry a token of their own.
 */
export type ShareKind = "collections";

/**
 * The link to hand out for a share token
 *
 * @param kind what the token unlocks
 * @param token the secret
 *
 * @returns the absolute url
 */
export function shareLink(kind: ShareKind, token: string): string {
    return `${window.location.origin}/shared/${kind}/${token}`;
}

/**
 * Whether a failed request means the link itself no longer resolves
 *
 * @param error what the request rejected with
 *
 * @returns whether the link is the thing that is broken
 */
export function isDeadShareLink(error: unknown): boolean {
    return error instanceof ResponseError && error.response.status === 400;
}
