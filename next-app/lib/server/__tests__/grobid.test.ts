import { describe, expect, it } from "vitest";
import { parseGrobidHeaderXml } from "../grobid";

describe("parseGrobidHeaderXml", () => {
  it("extracts core metadata from a valid GROBID TEI header", () => {
    const tei = `<?xml version="1.0" encoding="UTF-8"?>
<TEI>
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Effect of Sleep Intervention on Glucose Control</title>
      </titleStmt>
      <sourceDesc>
        <biblStruct>
          <analytic>
            <title level="a">Effect of Sleep Intervention on Glucose Control</title>
            <author>
              <persName>
                <forename type="first">Jane</forename>
                <surname>Smith</surname>
              </persName>
            </author>
            <author>
              <persName>
                <forename type="first">John</forename>
                <forename type="middle">R.</forename>
                <surname>Doe</surname>
              </persName>
            </author>
            <idno type="DOI">10.1016/j.cell.2023.01.001</idno>
          </analytic>
          <monogr>
            <title level="j">Journal of Clinical Sleep Medicine</title>
            <imprint>
              <date when="2024-02-14">2024</date>
            </imprint>
          </monogr>
        </biblStruct>
      </sourceDesc>
    </fileDesc>
    <profileDesc>
      <abstract>
        <p>Background: Sleep affects metabolism. Methods: Randomized trial.</p>
      </abstract>
    </profileDesc>
  </teiHeader>
</TEI>`;

    const parsed = parseGrobidHeaderXml(tei);

    expect(parsed).toEqual({
      title: "Effect of Sleep Intervention on Glucose Control",
      authors: "Jane Smith, John R. Doe",
      abstract: "Background: Sleep affects metabolism. Methods: Randomized trial.",
      doi: "10.1016/j.cell.2023.01.001",
      journal: "Journal of Clinical Sleep Medicine",
      year: 2024,
    });
  });

  it("returns null for invalid xml", () => {
    expect(parseGrobidHeaderXml("<not xml")).toBeNull();
  });

  it("returns null when no usable metadata exists", () => {
    const tei = `<?xml version="1.0" encoding="UTF-8"?>
<TEI>
  <teiHeader>
    <fileDesc>
      <titleStmt />
    </fileDesc>
  </teiHeader>
</TEI>`;
    expect(parseGrobidHeaderXml(tei)).toBeNull();
  });
});
