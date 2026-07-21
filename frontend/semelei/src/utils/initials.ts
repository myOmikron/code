/**
 * Helper function to construct the initials required for the Avatar component
 *
 * @param displayName The name of the user
 *
 * @returns Initials of the user
 */
export function getInitials(displayName: string): string {
    return displayName
        .split(" ")
        .map((part: string) => part[0])
        .join("");
}
