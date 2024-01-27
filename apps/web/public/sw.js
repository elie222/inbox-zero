/* Service Worker */

const version = 1;
const dbVersion = 2;
const database = "inbox-zero";
let DB = null;
let dynamicName = `dynamicCache`;
let IMAGE_CACHE = "IMAGE_CACHE";
const LABEL_STORE = {
  name: "labels",
  key: "id",
  indexes: [],
};
const EMAIL_STORE = {
  name: "emails",
  key: "gmailMessageId",
  indexes: [{ name: "timestampIDX", property: "timestamp", params: {} }],
};
const ALL_STORES = [LABEL_STORE, EMAIL_STORE];

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
  if (!isAuth(event.request.url)) console.log(event.request.url);
  event.respondWith(
    handleFetch(event.request).then((response) => {
      if (event.request.url.includes("tinybird")) {
        console.log(response);
      }
      return response;
    }),
  );
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
    if (callback) {
      callback();
    }
  };
  return req;
};

async function handleFetch(request) {
  const { url } = request;
  if (url.includes("/api/google/labels")) {
    // this should be called regardless.
    fetchAndUpdateIDB(request.clone());

    // if the data is within idb
    if (DB) {
      const getData = new Promise(async (resolve, reject) => {
        let tx = DB.transaction(LABEL_STORE.name, "readonly");
        let store = tx.objectStore(LABEL_STORE.name);
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
    url.includes(".svg") ||
    url.includes(".jpg") ||
    url.includes(".png") ||
    url.includes(".jpeg")
  ) {
    const cacheResponse = await caches.match(request);
    if (cacheResponse) return cacheResponse;
    const fetchResponse = await fetch(request);

    //save in image cache
    console.log(`save an IMAGE file ${url}`);
    const cache = await caches.open(IMAGE_CACHE);
    cache.put(request, fetchResponse.clone());
    return fetchResponse;
  }

  if (url.includes("/api/user/stats/emails/all")) {
    // 1.check if the data is in indexeddb
    // 2. if no data make the request to the backend for ALL the data
    // 3. if data -> return data immediately, fetch remaining data in background
    // 4. when remaining data is available, cache it -> send a message to the client about the newly recieved data  []
    const localData = await loadLocalMail();
    if (localData) {
      return new Response(
        JSON.stringify({
          mailList: localData,
          page: Math.floor(localData.length / 100),
        }),
      );
    }
    const fetchResponse = await fetch(request);
    const mails = await fetchResponse.json();

    saveMails(mails);
    // console.log("✅/api/user/stats/emails/all", data);

    // TODO:The FetchEvent for "http://localhost:3000/api/user/stats/emails/all" resulted in a network error response: a Response whose "body" is locked cannot be used to respond to a request.

    //
    return new Response(JSON.stringify(mails), { status: 200 });
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
      const tx = DB.transaction(LABEL_STORE.name, "readwrite");

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

const loadLocalMail = async () => {
  if (!DB) await openDB();

  const data = await getLocalMail();
  if (data.length > 0) return data;
  return null;
};

const getLocalMail = () => {
  return new Promise((resolve, reject) => {
    const tx = DB.transaction(EMAIL_STORE.name, "readonly");
    const store = tx.objectStore(EMAIL_STORE.name);
    const index = store.index("timestampIDX");
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result);
  });
  // make a utility function for creating transaction.
};

const saveMails = async (mails) => {
  if (!DB) {
    await openDB();
  }
  const tx = DB.transaction(EMAIL_STORE.name, "readwrite");
  const store = tx.objectStore(EMAIL_STORE.name);

  for (const mail of mails.mailList) {
    const req = store.add(mail);
    req.onsuccess = console.log("added mail");
    req.onerror = (e) =>
      console.log("error occurred while adding mails to index", e);
  }
};
