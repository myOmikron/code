/**
 * Read a file's contents as a base64 string (without the data-url prefix).
 *
 * @param file the file to read
 *
 * @returns the base64-encoded contents
 */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const result = reader.result as string;
            // strip the "data:<mime>;base64," prefix
            resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.readAsDataURL(file);
    });
}
