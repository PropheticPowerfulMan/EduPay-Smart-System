export function printHtmlDocument(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 300);
  };

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument ?? frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    cleanup();
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  const settleWithin = <T>(promise: Promise<T>, timeoutMs: number) => new Promise<void>((resolve) => {
    let settled = false;
    const finalize = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    window.setTimeout(finalize, timeoutMs);
    void promise.finally(finalize);
  });

  const waitForImages = Promise.all(
    Array.from(frameDocument.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    })
  );

  const triggerPrint = () => {
    frameWindow.focus();
    frameWindow.print();
    frameWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 2000);
  };

  const fontsReady = frameDocument.fonts?.ready;
  if (fontsReady) {
    void Promise.all([
      settleWithin(fontsReady.catch(() => undefined), 450),
      settleWithin(waitForImages, 650)
    ]).finally(() => {
      window.setTimeout(triggerPrint, 60);
    });
    return;
  }

  void settleWithin(waitForImages, 650).finally(() => {
    window.setTimeout(triggerPrint, 80);
  });
}