declare module "citation-js" {
  type CiteFormatOptions = {
    format?: "text" | "html" | "string" | "json";
    template?: string;
    lang?: string;
  };

  export default class Cite {
    constructor(data?: unknown);
    format(type: "bibliography", options?: CiteFormatOptions): string;
  }
}
