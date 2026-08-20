/**
 * Persistent browser storage for the card index's files.
 *
 * The index is hundreds of megabytes; downloading it once per session is what makes the scanner
 * feel broken. Every file is stored here as the raw bytes the server sent (usually still
 * gzipped), keyed by index version + path — so a new index version simply misses the cache and
 * the old version's files are pruned once the new manifest is known.
 *
 * Runs inside the scan worker; IndexedDB is the only browser storage of this size available
 * there. Every failure degrades to "no cache": the network path still works.
 */

const DB_NAME = "planarium-card-index";
const STORE_NAME = "files";
const DB_VERSION = 1;

/** One stored file: the bytes as served, and whether they still need gunzipping. */
export type StoredIndexFile = { bytes: ArrayBuffer; compressed: boolean };

let pendingDb: Promise<IDBDatabase | null> | null = null;

/**
 * Opens the database once
 *
 * @returns the database, or `null` where IndexedDB is unavailable or broken
 */
function openDb(): Promise<IDBDatabase | null> {
    if (pendingDb) return pendingDb;
    pendingDb = new Promise((resolve) => {
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    request.result.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return pendingDb;
}

/**
 * Reads one stored file
 *
 * @param key the file's cache key
 * @returns the file, or `null` on miss or storage failure
 */
export async function readIndexFile(key: string): Promise<StoredIndexFile | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
            request.onsuccess = () => {
                const value = request.result as StoredIndexFile | undefined;
                resolve(value && value.bytes instanceof ArrayBuffer ? value : null);
            };
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

/**
 * Stores one file, best effort — a full quota simply leaves the file uncached
 *
 * @param key the file's cache key
 * @param file the file to store
 */
export async function writeIndexFile(key: string, file: StoredIndexFile): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put(file, key);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
            transaction.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/**
 * Drops one stored file, e.g. after it failed validation
 *
 * @param key the file's cache key
 */
export async function deleteIndexFile(key: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).delete(key);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
            transaction.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/**
 * Drops every stored file that does not belong to the current index version.
 *
 * Called once the fresh manifest is known — an index refresh would otherwise leave the previous
 * version's hundreds of megabytes stranded in the quota forever.
 *
 * @param keep keys to keep
 * @param keep.exact exact key names to keep, e.g. the manifest
 * @param keep.prefix the current version's `${version}:` prefix to keep
 */
export async function pruneIndexFiles(keep: { exact: string[]; prefix: string }): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                const key = String(cursor.key);
                if (!keep.exact.includes(key) && !key.startsWith(keep.prefix)) cursor.delete();
                cursor.continue();
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
            transaction.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}
