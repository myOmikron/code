/**
 * The outer error the api returns. This is most likely not deal-able by the frontend
 */
export type ApiError = {
    /** TraceID for debugging purposes */
    trace_id: string;
};

/**
 * Helper function to parse errors
 *
 * @param response The response of the request
 *
 * @returns Promise of with an ApiError
 */
export async function parseError(response: Response): Promise<ApiError> {
    try {
        return await response.json();
    } catch {
        console.error("Got invalid json", response.body);
        return {
            trace_id: "-",
        };
    }
}
