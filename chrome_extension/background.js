chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  chrome.storage.local.get(['enabled'], async (data) => {
    if (!data.enabled) {
      suggest();
      return;
    }

    const filename = item.filename;
    const isIaFile = /\.(mp4|mov|png|jpg|jpeg|webp)$/i.test(filename);

    if (isIaFile) {
      console.log("[Pipeta Catch] Intercepting download:", filename);
      try {
        fetch('http://localhost:3002/api/ia/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: filename,
            sourceUrl: item.url
          })
        }).catch(err => console.log("Pipeta server offline", err));
      } catch(e) {}
    }

    suggest();
  });
  return true;
});
