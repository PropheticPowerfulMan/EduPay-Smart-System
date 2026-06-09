type Html2CanvasType = typeof import("html2canvas").default;
type JsPdfCtor = typeof import("jspdf").jsPDF;

type PdfRenderOptions = {
  filename: string;
  backgroundColor?: string;
  scale?: number;
  width?: number;
  height?: number;
  windowWidth?: number;
  windowHeight?: number;
};

let pdfModulesPromise: Promise<{ html2canvas: Html2CanvasType; jsPDF: JsPdfCtor }> | null = null;

function loadPdfModules() {
  if (!pdfModulesPromise) {
    pdfModulesPromise = Promise.all([import("html2canvas"), import("jspdf")]).then(([{ default: html2canvas }, { jsPDF }]) => ({
      html2canvas,
      jsPDF
    }));
  }

  return pdfModulesPromise;
}

function settleWithin(promise: Promise<unknown>, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    window.setTimeout(finish, timeoutMs);
    void promise.finally(finish);
  });
}

export async function exportElementToPdf(element: HTMLElement, options: PdfRenderOptions) {
  const { html2canvas, jsPDF } = await loadPdfModules();

  await settleWithin((element.ownerDocument?.fonts?.ready ?? Promise.resolve()).catch?.(() => undefined) ?? Promise.resolve(), 450);

  const scale = options.scale ?? Math.min(1.6, Math.max(1.2, window.devicePixelRatio || 1));
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: options.backgroundColor ?? "#ffffff",
    width: options.width,
    height: options.height,
    windowWidth: options.windowWidth,
    windowHeight: options.windowHeight,
  });

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageData = canvas.toDataURL("image/png");
  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  let remainingHeight = imageHeight;
  let position = 0;

  pdf.addImage(imageData, "PNG", 0, position, imageWidth, imageHeight, undefined, "FAST");
  remainingHeight -= pageHeight;

  while (remainingHeight > 0) {
    position = remainingHeight - imageHeight;
    pdf.addPage();
    pdf.addImage(imageData, "PNG", 0, position, imageWidth, imageHeight, undefined, "FAST");
    remainingHeight -= pageHeight;
  }

  pdf.save(options.filename);
}