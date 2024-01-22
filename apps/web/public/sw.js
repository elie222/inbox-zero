/* Service Worker */

const version = 1;
const dbVersion = 1;
const database = "inbox-zero";
let DB = null;
let dynamicName = `dynamicCache`;
let IMAGE_CACHE = "IMAGE_CACHE";
const LABEL_STORE = "labels";
const EMAIL_STORE = "emails";

self.addEventListener("install", (event) => {
  console.log(`Version ${version} installed`);
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  //service worker is activated
  event.waitUntil(Promise.resolve().then(openDB));
  console.log("activated");
});

self.addEventListener("fetch", (event) => {
  //service worker intercepted a fetch call
  if (!isAuth(event.request.url)) event.respondWith(handleFetch(event.request));
});

self.addEventListener("message", (event) => {
  //message from webpage
});

const openDB = (callback) => {
  let req = indexedDB.open(database, dbVersion);
  req.onerror = (err) => {
    //could not open db
    console.warn(err);
    DB = null;
  };
  req.onupgradeneeded = (ev) => {
    let db = ev.target.result;
    if (!db.objectStoreNames.contains(LABEL_STORE)) {
      db.createObjectStore(LABEL_STORE, {
        keyPath: "id",
      });
    }
  };
  req.onsuccess = (ev) => {
    DB = ev.target.result;
    console.log("db opened and upgraded as needed");
    if (callback) {
      callback();
    }
  };
  return req;
};

async function handleFetch(request) {
  if (request.url.includes("/api/google/labels")) {
    // this should be called regardless.
    fetchAndUpdateIDB(request.clone());

    // if the data is within idb
    if (DB) {
      const getData = new Promise(async (resolve, reject) => {
        let tx = DB.transaction(LABEL_STORE, "readonly");
        let store = tx.objectStore(LABEL_STORE);
        let req = store.getAll();

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        const result = await getData;
        if (result.length)
          return new Response(JSON.stringify({ labels: result }), {
            status: 200,
          });
      } catch (error) {
        console.log("Error while getting data from indexeddb", error.message);
        // return new Response(`Error:  + ${error.message}`, {
        //   status: 500,
        //   headers: { "Content-Type": "text/plain" },
        // });
      }
    }
  }

  if (
    request.url.includes(".svg") ||
    request.url.includes(".jpg") ||
    request.url.includes(".png") ||
    request.url.includes(".jpeg")
  ) {
    const cacheResponse = await caches.match(request);
    if (cacheResponse) return cacheResponse;
    const fetchResponse = await fetch(request);

    //save in image cache
    console.log(`save an IMAGE file ${request.url}`);
    const cache = await caches.open(IMAGE_CACHE);
    cache.put(request, fetchResponse.clone());
    return fetchResponse;
  }

  return fetch(request);
}

async function fetchAndUpdateIDB(request) {
  const networkResponse = await fetch(request);
  const clonedResponse = networkResponse.clone();

  // open the database connection
  const data = await clonedResponse.json();
  if (!data?.labels) return;

  await saveLabels(data.labels);
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "LABELS_UPDATED",
        data,
      });
    });
  });
}

async function saveLabels(labels) {
  if (!labels.length) return;
  if (!DB) {
    try {
      await openDB();
      const tx = DB.transaction(LABEL_STORE, "readwrite");

      await Promise.all([
        ...labels.map((label) => {
          return tx.store.add(label);
        }),
        tx.done,
      ]);
    } catch (err) {
      console.log(err);
      throw err;
    }
  }
}

// this is written to avoid callback failure for first time users as the redirection fails only in the tab they used to login
// goes away with hard reload (CTRL + SHIFT + R)
const isAuth = (url) =>
  url.includes("welcome") ||
  url.includes("api/auth") ||
  url.includes("newsletters");

// TODO: this can independently poll for the latest data from the api and withhout consuming client resources
