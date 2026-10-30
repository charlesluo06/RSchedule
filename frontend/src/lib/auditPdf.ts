const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Reads a Degree Works audit PDF in the browser and returns its text, one line
// per row. The file never leaves the device. pdf.js is big, so it's imported
// here (not at the top of the app) and only downloads when someone actually
// uploads an audit. The "legacy" build is used because the modern one needs
// newer JS features than some phones' browsers have.
export async function readAuditPdf(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please choose a PDF file.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("That file is too large to be a degree audit.");
  }

  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  try {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let text = "";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : "");
      }
      text += "\n";
    }
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") {
      throw new Error("That PDF is password protected. Download a fresh copy of your audit and try again.");
    }
    throw new Error("Couldn't read that PDF. Make sure it's your degree audit saved as a PDF.");
  }
}
