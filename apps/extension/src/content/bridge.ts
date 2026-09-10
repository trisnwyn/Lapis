// Chạy trên origin webapp Lapis: bridge nhận yêu cầu từ webapp → trả sessions từ background.

interface WebappMessage {
  source?: string;
  type?: string;
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as WebappMessage | null;
  if (!data || data.source !== 'lapis-webapp' || data.type !== 'lapis:get-sessions') return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return; // extension reload → context cũ chết
  try {
    chrome.runtime.sendMessage({ type: 'lapis:get-state' }, (response: unknown) => {
      if (chrome.runtime.lastError) return;
      const sessions = ((response as { sessions?: unknown[] } | undefined)?.sessions ?? []) as unknown[];
      window.postMessage(
        { source: 'lapis-extension', type: 'lapis:sessions', drafts: sessions },
        '*',
      );
    });
  } catch {
    // Extension context invalidated — content script này thuộc phiên cũ, F5 webapp
  }
});
