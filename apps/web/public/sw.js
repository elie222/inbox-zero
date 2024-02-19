const version = 1;
const database = "inbox-zero";
const dbVersion = 1;
let DB = null;
const LABEL_STORE = {
    name: "labels",
    key: "id",
    indexes: [],
};
const EMAIL_STORE = {
    name: "emails",
    key: "gmailMessageId",
    indexes: [{ name: "timestamp", property: "timestamp", params: {} }],
};
const ALL_STORES = [LABEL_STORE, EMAIL_STORE];

self.addEventListener("install", (_event) => {
    console.log(`Version ${version} installed`);
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(openDB());
    console.log("activated");
});
  
self.addEventListener("fetch", () => {
  console.log("intercepted a fetch");
});

const openDB = () => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(database, dbVersion);
        req.onerror = (err) => {
            //could not open db
            console.warn(err);
            DB = null;
            reject(err);
        };
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            for (const store of ALL_STORES) {
                const { name, key, indexes } = store;
                if (!db.objectStoreNames.contains(name)) {
                    const objectStore = db.createObjectStore(name, {
                        keyPath: key,
                    });

                    for (const index of indexes) {
                        const { name, property, params } = index;
                        objectStore.createIndex(name, property, params);
                    }
                }
            }
        };
        req.onsuccess = (ev) => {
            DB = ev.target.result;
            console.log("db opened and upgraded as needed");
            resolve();
        };
    });
};

