// MAIN world: patch fetch + XHR để bắt JSON response của API lịch học LMS.
(() => {
  if ((window as unknown as { __lapisPatched?: boolean }).__lapisPatched) return;
  (window as unknown as { __lapisPatched?: boolean }).__lapisPatched = true;

  const MAX_BODY = 400_000;
  const URL_HINT = /schedule|timetable|calendar|lesson|class|session|course/i;

  const post = (url: string, payload: unknown): void => {
    window.postMessage(
      { source: 'lapis-injected', kind: 'http', url, payload },
      location.origin,
    );
  };

  const tryCapture = (url: string, text: string): void => {
    if (text.length === 0 || text.length > MAX_BODY) return;
    const isVjcbi = /vjcbi\.study/.test(location.origin);
    if (!isVjcbi && !URL_HINT.test(url) && !/session|lesson|schedule/i.test(text.slice(0, 800))) return;
    try {
      post(url, JSON.parse(text) as unknown);
    } catch {
      // không phải JSON — bỏ qua
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch.call(this, input, init);
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (URL_HINT.test(url)) {
        response.clone().text().then((text) => tryCapture(url, text), () => {});
      }
    } catch {
      // không chặn request gốc
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function patchedOpen(this: XMLHttpRequest, ...args: unknown[]) {
    (this as unknown as { __lapisUrl?: string }).__lapisUrl = String(args[1]);
    return (originalOpen as unknown as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function patchedSend(this: XMLHttpRequest, ...args: unknown[]) {
    this.addEventListener('load', () => {
      try {
        const url = (this as unknown as { __lapisUrl?: string }).__lapisUrl ?? '';
        if (URL_HINT.test(url)) {
          tryCapture(url, String(this.responseText ?? ''));
        }
      } catch {
        // bỏ qua
      }
    });
    return (originalSend as unknown as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.send;
})();
