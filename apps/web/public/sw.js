/* Service Worker */

const version = 1;
const dbVersion = 2;
const database = "inbox-zero";
let DB = null;
const IMAGE_CACHE = "IMAGE_CACHE";
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

const LABELS_UPDATED = "LABELS_UPDATED";
const MAILS_UPDATED = "MAILS_UPDATED";

const MESSAGES = { LABELS_UPDATED, MAILS_UPDATED };

const TIME_CONSTANT = {
  // in ms
  hour: 3600_000,
  day: 86400_000,
  week: 604800_000,
  month: 2629743_000,
  year: 31556926_000,
};

self.addEventListener("install", (_event) => {
  console.log(`Version ${version} installed`);
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.resolve().then(openDB));
  console.log("activated");
});

self.addEventListener("fetch", (event) => {
  //service worker intercepted a fetch call
  console.log(event.request.url);
  if (!isAuth(event.request.url))
    event.respondWith(handleFetch(event.request));
});


const openDB = (callback) => {
  return new Promise((resolve, reject) => {
    let req = indexedDB.open(database, dbVersion);
    req.onerror = (err) => {
      //could not open db
      console.warn(err);
      DB = null;
      reject(err);
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
      resolve();
    };
  });
};

async function handleFetch(request) {
  const { url } = request;
  if (url.includes("/api/google/labels")) {
    fetchLablesAndUpdateIDB(request.clone());

    // if the data is within idb
    if (DB) {
      const getData = () =>
        new Promise(async (resolve, reject) => {
          let tx = DB.transaction(LABEL_STORE.name, "readonly");
          let store = tx.objectStore(LABEL_STORE.name);
          let req = store.getAll();

          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      try {
        const result = await getData();
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
    const requestData = await request.clone().json();
    const localData = await loadLocalMail(!requestData.loadBefore);
    if (localData?.length > 0) {
      const newRequest = new Request(request, {
        body: JSON.stringify({
          ...requestData,
          timestamp: localData[0].timestamp,
        }),
      });
      // get Rest of the data
      fetchAndUpdateMails(newRequest, !requestData.loadBefore);
      return new Response(
        JSON.stringify({
          emails: localData,
          page: Math.floor(localData.length / 100),
        }),
      );
    }
    const fetchResponse = await fetch(request);
    const mails = await fetchResponse.json();

    saveMails(mails);

    return new Response(JSON.stringify(mails), { status: 200 });
  }

  if (url.includes("/api/user/stats/emails/sw")) {
    const { searchParams } = new URL(url);
    const params = {
      period: searchParams.get("period") || "week", // "day", "week", "month", "year"
      fromDate: searchParams.get("fromDate"), // null or undefined
      toDate: searchParams.get("toDate"), // null or undefined
    };
    // 1. Get Data stats based on the timestamp
    const stats = await getStatsByPeriod(params);
    if (stats)
      return new Response(JSON.stringify(stats), {
        status: 200,
      });

    return new Response(
      JSON.stringify({
        message: "No stored data found in indexedDB for analytics",
      }),
    );
  }
  return fetch(request);
}

async function fetchLablesAndUpdateIDB(request) {
  const networkResponse = await fetch(request);
  const clonedResponse = networkResponse.clone();

  // open the database connection
  const data = await clonedResponse.json();
  if (!data?.labels) return;

  await saveLabels(data.labels);
  messageClients(MESSAGES.LABELS_UPDATED, data);
}

function messageClients(type, payload) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type,
        payload,
      });
    });
  });
}

async function saveLabels(labels) {
  if (!labels.length) return;
  try {
    if (!DB) await openDB();
    const tx = DB.transaction(LABEL_STORE.name, "readwrite");
    tx.onsuccess = () => {
      console.log("Added all labels successfully in indexed db");
    };
    tx.onerror = (error) => {
      console.warn(error);
    };
    const store = tx.objectStore(LABEL_STORE.name);

    await Promise.all([
      ...labels.map(
        (label) =>
          new Promise((resolve, reject) => {
            const req = store.put(label);
            req.onsuccess = () => resolve();
            req.onerror = (error) => reject(error);
          }),
      ),
    ]);
  } catch (err) {
    console.log(err);
    throw err;
  }
}

// this is written to avoid callback failure for first time users as the redirection fails only in the tab they used to login
// goes away with hard reload (CTRL + SHIFT + R)
const isAuth = (url) => {
  if (url.includes("/api/auth/signout")) clearAllData();
  return (
    url.includes("welcome") ||
    url.includes("api/auth") ||
    url.includes("newsletters")
  );
};

const loadLocalMail = async (decreasing = false) => {
  if (!DB) await openDB();

  const data = await getLocalMail(decreasing);
  if (data.length > 0) return data;
  return null;
};

const getLocalMail = (decreasing, keyRange) => {
  return new Promise((resolve, reject) => {
    const tx = DB.transaction(EMAIL_STORE.name, "readonly");
    const store = tx.objectStore(EMAIL_STORE.name);
    const index = store.index("timestamp");

    // this request will get a range query with increasing order of timestamp (i.e. oldest to latest)
    // if keyRange is undefined, it will get all the data.
    const req = index.getAll(keyRange);

    req.onerror = () => resolve(req.error);
    req.onsuccess = () =>
      resolve(decreasing ? req.result : req.result.reverse());
  });
  // TODO: make a utility function for creating transaction.
};

const saveMails = async (mails) => {
  if (!DB) {
    await openDB();
  }
  const tx = DB.transaction(EMAIL_STORE.name, "readwrite");
  const store = tx.objectStore(EMAIL_STORE.name);

  for (const mail of mails.emails) {
    const req = store.put(mail);
    req.onsuccess = console.log("added mail");
    req.onerror = (e) =>
      console.log("error occurred while adding mails to index", e);
  }
};

async function fetchAndUpdateMails(request, decreasing) {
  const resp = await fetch(request);
  const restMails = await resp.json();
  await saveMails(restMails);
  const allMails = await loadLocalMail(decreasing);
  messageClients(MESSAGES.MAILS_UPDATED, allMails);
}

/* Analytics/ Stats Part */

function getStatsByPeriod(options) {
  return new Promise(async (resolve, reject) => {
    const { period, fromDate, toDate } = options;
    // TODO: Figure out a way to use import statment in service worker without causing error, so you can use lodash in service worker ->Uncaught SyntaxError: Cannot use import statement outside a module (at service-worker.js:1:1)

    const keyRange = IDBKeyRange.bound(+fromDate, +toDate, true, true);

    const localData = await getLocalMail(false, keyRange);

    resolve(getAllMailsClusterdbyPeriod(+fromDate, +toDate, period, localData));
  });
}

// all inclusive
const numberOfClusters = (start, end, size) => {
  const window = (end - start + 1) / size;
  return Math.floor(window) + (window - Math.floor(window) > 0 ? 1 : 0);
};

const getClusteredArray = (start, end, size) => {
  const nClusters = numberOfClusters(start, end, size);
  const clusters = [];
  for (let i = 0; i < nClusters; i++) {
    clusters.push({
      startOfPeriod: new Date(
        i < nClusters - 1 ? start + i * size : end,
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
      All: 0,
      Sent: 0,
      Read: 0,
      Unread: 0,
      Archived: 0,
      Unarchived: 0,
    });
  }
  return clusters;
};

function getAllMailsClusterdbyPeriod(fromDate, toDate, period, data) {
  if (!data || !data.length) return;

  const clusters = getClusteredArray(
    fromDate,
    toDate ?? fromDate,
    TIME_CONSTANT[period],
  );
  // const
  for (item of data) {
    const clusterIndex = Math.floor(
      (item.timestamp - fromDate) / TIME_CONSTANT[period],
    );
    const cluster = clusters[clusterIndex];
    // All ++
    cluster.All++;

    // Read/Unread
    item.read ? cluster.Read++ : cluster.Unread++;

    // Sent
    item.sent || cluster.Sent++;

    // Inbox/Archived
    item.inbox ? cluster.Unarchived++ : cluster.Archived++;
  }

  //cleaning (if we want zeros, we can remove cleaning)
  clusters.forEach((ele) => {
    const keys = Object.keys(ele);
    for (key of keys) if (ele[key] === 0) delete ele[key];
  });

  return {
    result: clusters,
    allCount: clusters.reduce((sum, ele) => sum + (ele.All ?? 0), 0),
    inboxCount: clusters.reduce((sum, ele) => sum + (ele.Unarchived ?? 0), 0),
    readCount: clusters.reduce((sum, ele) => sum + (ele.Read ?? 0), 0),
    sentCount: clusters.reduce((sum, ele) => sum + (ele.Sent ?? 0), 0),
  };
}

async function clearAllData() {
  if (!DB) await openDB();

  for (STORE of ALL_STORES) {
    const tx = DB.transaction(STORE.name, "readwrite");
    const store = tx.objectStore(STORE.name);
    const req = store.clear();
    req.onsuccess = () =>
      console.log(`All data cleared from store : ${STORE.name}`);
    req.onerror = (error) => {
      console.log(`Store data deletion failed with reason :`, error);
    };
  }
}
