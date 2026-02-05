import { describe, it, expect } from "vitest";
import { parsePubMedXml } from "@/lib/server/search/pubmed";

const MULTI_AUTHOR_XML = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">12345678</PMID>
      <Article>
        <Journal>
          <JournalIssue>
            <Volume>45</Volume>
            <Issue>3</Issue>
            <PubDate><Year>2024</Year></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Statin therapy in elderly patients: a randomized trial</ArticleTitle>
        <Pagination><MedlinePgn>100-110</MedlinePgn></Pagination>
        <Abstract>
          <AbstractText>This study examines statin therapy outcomes.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author>
            <LastName>Smith</LastName>
            <Initials>JA</Initials>
          </Author>
          <Author>
            <LastName>Doe</LastName>
            <Initials>B</Initials>
          </Author>
          <Author>
            <LastName>Chen</LastName>
            <Initials>WL</Initials>
          </Author>
        </AuthorList>
      </Article>
      <MedlineJournalInfo>
        <MedlineTA>J Cardiol</MedlineTA>
      </MedlineJournalInfo>
      <MeshHeadingList>
        <MeshHeading>
          <DescriptorName>Hydroxymethylglutaryl-CoA Reductase Inhibitors</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName>Aged</DescriptorName>
        </MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">12345678</ArticleId>
        <ArticleId IdType="doi">10.1234/jcard.2024.001</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

const SINGLE_AUTHOR_XML = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">99999999</PMID>
      <Article>
        <Journal>
          <JournalIssue>
            <PubDate><Year>2023</Year></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Solo author paper</ArticleTitle>
        <AuthorList>
          <Author>
            <LastName>Tanaka</LastName>
            <Initials>K</Initials>
          </Author>
        </AuthorList>
      </Article>
      <MedlineJournalInfo>
        <MedlineTA>Nat Med</MedlineTA>
      </MedlineJournalInfo>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">99999999</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

const MISSING_ABSTRACT_XML = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">11111111</PMID>
      <Article>
        <Journal>
          <JournalIssue>
            <PubDate><MedlineDate>2022 Jan-Feb</MedlineDate></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>No abstract paper</ArticleTitle>
        <AuthorList>
          <Author>
            <LastName>Lee</LastName>
            <Initials>S</Initials>
          </Author>
        </AuthorList>
      </Article>
      <MedlineJournalInfo>
        <MedlineTA>BMJ</MedlineTA>
      </MedlineJournalInfo>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">11111111</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

const STRUCTURED_ABSTRACT_XML = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">22222222</PMID>
      <Article>
        <Journal>
          <JournalIssue>
            <PubDate><Year>2025</Year></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Structured abstract paper</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Background text here.</AbstractText>
          <AbstractText Label="METHODS">Methods text here.</AbstractText>
          <AbstractText Label="RESULTS">Results text here.</AbstractText>
          <AbstractText Label="CONCLUSIONS">Conclusions text here.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author>
            <LastName>Garcia</LastName>
            <Initials>M</Initials>
          </Author>
        </AuthorList>
      </Article>
      <MedlineJournalInfo>
        <MedlineTA>Lancet</MedlineTA>
      </MedlineJournalInfo>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">22222222</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

const COLLECTIVE_AUTHOR_XML = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">33333333</PMID>
      <Article>
        <Journal>
          <JournalIssue>
            <PubDate><Year>2024</Year></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Collective author paper</ArticleTitle>
        <AuthorList>
          <Author>
            <CollectiveName>WHO Working Group</CollectiveName>
          </Author>
        </AuthorList>
      </Article>
      <MedlineJournalInfo>
        <MedlineTA>Bull WHO</MedlineTA>
      </MedlineJournalInfo>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">33333333</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

describe("parsePubMedXml", () => {
  it("parses multi-author article with all fields", () => {
    const results = parsePubMedXml(MULTI_AUTHOR_XML);
    expect(results).toHaveLength(1);

    const article = results[0];
    expect(article.pmid).toBe("12345678");
    expect(article.doi).toBe("10.1234/jcard.2024.001");
    expect(article.title).toBe("Statin therapy in elderly patients: a randomized trial");
    expect(article.authors).toBe("Smith JA, Doe B, Chen WL");
    expect(article.year).toBe(2024);
    expect(article.journal).toBe("J Cardiol");
    expect(article.volume).toBe("45");
    expect(article.issue).toBe("3");
    expect(article.pages).toBe("100-110");
    expect(article.abstract).toBe("This study examines statin therapy outcomes.");
    expect(article.keywords).toEqual([
      "Hydroxymethylglutaryl-CoA Reductase Inhibitors",
      "Aged",
    ]);
    expect(article.source).toBe("pubmed");
    expect(article.sourceUrl).toBe("https://pubmed.ncbi.nlm.nih.gov/12345678/");
  });

  it("parses single-author article (isArray handles single Author)", () => {
    const results = parsePubMedXml(SINGLE_AUTHOR_XML);
    expect(results).toHaveLength(1);

    const article = results[0];
    expect(article.pmid).toBe("99999999");
    expect(article.authors).toBe("Tanaka K");
    expect(article.year).toBe(2023);
    expect(article.journal).toBe("Nat Med");
    expect(article.abstract).toBeUndefined();
    expect(article.doi).toBeUndefined();
    expect(article.keywords).toBeUndefined();
  });

  it("handles missing abstract", () => {
    const results = parsePubMedXml(MISSING_ABSTRACT_XML);
    expect(results).toHaveLength(1);
    expect(results[0].abstract).toBeUndefined();
  });

  it("parses MedlineDate fallback for year", () => {
    const results = parsePubMedXml(MISSING_ABSTRACT_XML);
    expect(results[0].year).toBe(2022);
  });

  it("parses structured abstract with labels", () => {
    const results = parsePubMedXml(STRUCTURED_ABSTRACT_XML);
    expect(results).toHaveLength(1);

    const abstract = results[0].abstract!;
    expect(abstract).toContain("BACKGROUND: Background text here.");
    expect(abstract).toContain("METHODS: Methods text here.");
    expect(abstract).toContain("RESULTS: Results text here.");
    expect(abstract).toContain("CONCLUSIONS: Conclusions text here.");
  });

  it("handles collective author name", () => {
    const results = parsePubMedXml(COLLECTIVE_AUTHOR_XML);
    expect(results[0].authors).toBe("WHO Working Group");
  });

  it("returns empty array for empty XML", () => {
    const results = parsePubMedXml(`<?xml version="1.0" ?><PubmedArticleSet></PubmedArticleSet>`);
    expect(results).toEqual([]);
  });

  it("returns empty array for invalid XML", () => {
    const results = parsePubMedXml("<html><body>Not PubMed</body></html>");
    expect(results).toEqual([]);
  });
});
