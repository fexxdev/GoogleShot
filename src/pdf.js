import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

const PAGE_WIDTH = 960;

export async function buildPdf(images, outputPath) {
  const pdf = await PDFDocument.create();
  for (const buffer of images) {
    const image = await pdf.embedJpg(buffer);
    const height = (PAGE_WIDTH * image.height) / image.width;
    const page = pdf.addPage([PAGE_WIDTH, height]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height });
  }
  await fs.writeFile(outputPath, await pdf.save());
}
