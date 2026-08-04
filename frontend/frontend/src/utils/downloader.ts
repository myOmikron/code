/**
 * Download content as a file
 *
 * @param filename Filename to set
 * @param text Content that should be downloaded
 */
export function downloadFile(filename: string, text: string) {
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    element.setAttribute("download", filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
