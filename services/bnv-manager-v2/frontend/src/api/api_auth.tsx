import { Configuration, DefaultApi } from "src/api/generated/auth";
import { RequiredError, ResponseError } from "src/api/generated/auth";
import { parseError } from "src/api/error";

const authApi = new DefaultApi(new Configuration({ basePath: window.location.origin }));

export const AuthApi = {
    login: (username: string, password: string) => authApi.signIn({ SignInRequest: { username, password } }),
    logout: () => handleError(authApi.signOut()),
};

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
            await parseError(e.response);
        } else if (e instanceof RequiredError) {
            console.error(e);
            msg = "The server's response didn't match the spec";
        } else {
            console.error("Unknown error occurred:", e);
            msg = "Unknown error occurred";
        }
        throw msg;
    }
}
