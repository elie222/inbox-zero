/* Service Worker */

const version = 1;
const dbVersion = 1;
const database = "inbox-zero";
let DB = null;
let staticName = `staticCache-${version}`;
let dynamicName = `dynamicCache`;
let fontName = "fontCache";
let imgName = "imageCache";
const LABEL_STORE = "labels";
const EMAIL_STORE = "emails";

let assets = ["/", "/index.html", "/css/main.css", "/js/app.js"]; // static assests

// TODO: look for images that can be cached

self.addEventListener("install", (event) => {
  console.log(`Version ${version} installed`);
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  //service worker is activated
  event.waitUntil(Promise.resolve().then(openDB));
  console.log("activated");
});

self.addEventListener("fetch", (event /* : FetchEvent */) => {
  //service worker intercepted a fetch call
  event.respondWith(handleFetch(event.request));
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
    fetchAndUpdateIDB(request);

    // if the data is within idb
    if (DB) {
      // TODO: handle the case when there is no data in db
      const getData = new Promise(async (resolve, reject) => {
        let tx = DB.transaction(LABEL_STORE, "readonly");
        let store = tx.objectStore(LABEL_STORE);
        let req = store.getAll();

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        const result = await getData;
        return new Response(JSON.stringify({ labels: result }), {
          status: 200,
        });
      } catch (error) {
        return new Response(`Error:  + ${error.message}`, {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
    }
  }
  return fetch(request);
}

async function fetchAndUpdateIDB(request) {
  const networkResponse = await fetch(request);
  const clonedResponse = networkResponse.clone();

  // open the database connection
  const data = await clonedResponse.json();
  if (!data?.label) return;

  await saveLabels(data.label);
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "dataUpdated",
        data: networkResponse.clone(),
      });
    });
  });
}

async function saveLabels(labels) {
  if (!labels.length) return;
  if (!DB) {
    try {
      await openDB();
    } catch (err) {
      throw err;
    }
  }

  const tx = DB.transaction(LABEL_STORE, "readwrite");

  await Promise.all([
    ...labels.map((label) => {
      return tx.store.add(label);
    }),
    tx.done,
  ]);
}

// TODO: this can independently poll for the latest data from the api and withhout consuming client resources

// check for cors and cache
