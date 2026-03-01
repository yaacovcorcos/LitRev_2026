import { describe, expect, it } from "vitest";
import { parseGrobidFulltextXml, parseGrobidHeaderXml } from "../grobid";

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

describe("parseGrobidFulltextXml", () => {
  it("extracts canonical sections from TEI body divs", () => {
    const tei = `<?xml version="1.0" encoding="UTF-8"?>
<TEI>
  <teiHeader>
    <profileDesc>
      <abstract><p>Header abstract text.</p></abstract>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <head>Introduction</head>
        <p>Intro paragraph.</p>
      </div>
      <div>
        <head>Methods</head>
        <p>Methods paragraph.</p>
      </div>
      <div>
        <head>Results</head>
        <p>Results paragraph.</p>
      </div>
      <div>
        <head>Discussion</head>
        <p>Discussion paragraph.</p>
      </div>
    </body>
  </text>
</TEI>`;

    const parsed = parseGrobidFulltextXml(tei);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections.introduction).toContain("Intro paragraph.");
    expect(parsed?.sections.methods).toContain("Methods paragraph.");
    expect(parsed?.sections.results).toContain("Results paragraph.");
    expect(parsed?.sections.discussion).toContain("Discussion paragraph.");
    expect(parsed?.sections.abstract).toContain("Header abstract text.");
    expect(parsed?.fullText).toContain("Intro paragraph.");
  });

  it("returns null for invalid fulltext xml", () => {
    expect(parseGrobidFulltextXml("<broken")).toBeNull();
  });
});
