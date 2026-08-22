import type { TrackerSession } from "@/features/tracker/types";

const DB_NAME = "tindeq-personal-tracker";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

export type TrackerStore = Readonly<{
  save(session: TrackerSession): Promise<TrackerSession>;
  list(): Promise<TrackerSession[]>;
  get(id: string): Promise<TrackerSession | undefined>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}>;

export function createTrackerStore(): TrackerStore {
  if (typeof indexedDB === "undefined") return createMemoryTrackerStore();
  return createIndexedDbTrackerStore();
}

export function createMemoryTrackerStore(initial: readonly TrackerSession[] = []): TrackerStore {
  const sessions = new Map(initial.map((session) => [session.id, session]));

  return {
    async save(session) {
      sessions.set(session.id, session);
      return session;
    },
    async list() {
      return sortSessions([...sessions.values()]);
    },
    async get(id) {
      return sessions.get(id);
    },
    async delete(id) {
      sessions.delete(id);
    },
    async clear() {
      sessions.clear();
    },
  };
}

function createIndexedDbTrackerStore(): TrackerStore {
  return {
    async save(session) {
      const database = await openDatabase();
      await requestToPromise(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(session));
      database.close();
      return session;
    },
    async list() {
      const database = await openDatabase();
      const sessions = await requestToPromise<TrackerSession[]>(database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll());
      database.close();
      return sortSessions(sessions);
    },
    async get(id) {
      const database = await openDatabase();
      const session = await requestToPromise<TrackerSession | undefined>(database.transaction(STORE_NAME).objectStore(STORE_NAME).get(id));
      database.close();
      return session;
    },
    async delete(id) {
      const database = await openDatabase();
      await requestToPromise(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id));
      database.close();
    },
    async clear() {
      const database = await openDatabase();
      await requestToPromise(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear());
      database.close();
    },
  };
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local tracker store"));
  });
}

function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local tracker store request failed"));
  });
}

function sortSessions(sessions: TrackerSession[]) {
  return sessions.sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt));
}
