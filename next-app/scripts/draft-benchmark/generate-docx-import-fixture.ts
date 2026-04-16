import fs from "node:fs/promises";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

async function main() {
  const targetPath = path.join(process.cwd(), "test", "fixtures", "draft", "imports", "source", "sample-manuscript.docx");

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun("Synthetic Benchmark Manuscript")],
          }),
          new Paragraph({
            children: [new TextRun("This generated DOCX sample exercises heading, prose, and bibliography-like fields.")],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun("Eligibility criteria were defined prospectively.")],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun("Outcome abstraction captured effect direction and variance.")],
          }),
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Metric")] }),
                  new TableCell({ children: [new Paragraph("Value")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Response rate")] }),
                  new TableCell({ children: [new Paragraph("64%")] }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [new TextRun("References: Smith 2020; Jones 2021.")],
          }),
        ],
      },
    ],
  });

  const bytes = await Packer.toBuffer(document);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, bytes);
  process.stdout.write(`${targetPath}\n`);
}

void main();
