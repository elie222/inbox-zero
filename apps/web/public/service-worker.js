function registerServiceWorker() {
    console.log("registerServiceWorker fired");
    if (typeof window !== "undefined") {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").then((registration) => {
          console.log("Service Worker registration successful:", registration);
        });
      }
    }
  }
  
  registerServiceWorker();
  