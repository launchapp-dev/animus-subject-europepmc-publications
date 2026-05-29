import { describe, expect, it } from "vitest";
import {
  authorsFromResult,
  labelsFromResult,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parsePublicationSubjectId,
  priorityFromResult,
  publicationKey,
  publicationSubjectId,
  publicationUrl,
  statusFromResult,
  subjectFromResult,
  toIso,
  truthyFlag,
} from "./index";

const config = {
  apiUrl: "https://www.ebi.ac.uk/europepmc/webservices/rest",
  query: "machine learning",
  limit: 50,
};

const result = {
  id: "41932012",
  source: "MED",
  pmid: "41932012",
  doi: "10.1000/example",
  title: "Machine learning in epilepsy.",
  authorString: "Ada Lovelace, Grace Hopper",
  journalTitle: "Example Journal",
  pubYear: "2026",
  firstPublicationDate: "2026-05-28",
  firstIndexDate: "2026-05-29",
  citedByCount: 125,
  isOpenAccess: "Y",
  inEPMC: "Y",
  hasReferences: "Y",
  hasTextMinedTerms: "N",
  fullTextUrlList: { fullTextUrl: [{ url: "https://example.org/fulltext", availability: "Open access" }] },
};

describe("Europe PMC publication helpers", () => {
  it("builds ids", () => {
    expect(publicationKey(result)).toBe("MED:41932012");
    expect(publicationSubjectId("MED:41932012")).toBe("europepmc.publication:MED%3A41932012");
    expect(parsePublicationSubjectId("europepmc.publication:MED%3A41932012")).toEqual({ source: "MED", externalId: "41932012" });
  });

  it("maps results to subjects", () => {
    const subject = subjectFromResult(config, result, "2026-05-29T16:00:00Z");
    expect(subject.id).toBe("europepmc.publication:MED%3A41932012");
    expect(subject.kind).toBe("europepmc.publication");
    expect(subject.status).toBe("done");
    expect(subject.native_status).toBe("MED");
    expect(subject.assignee).toBe("Ada Lovelace");
    expect(subject.priority).toBe(1);
    expect(subject.custom?.is_open_access).toBe(true);
  });

  it("extracts authors, status, priority, and URL", () => {
    expect(authorsFromResult(result)).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(nativeStatus(result)).toBe("MED");
    expect(statusFromResult(result)).toBe("done");
    expect(priorityFromResult(result)).toBe(1);
    expect(publicationUrl(result)).toBe("https://doi.org/10.1000/example");
  });

  it("labels and filters publications", () => {
    expect(labelsFromResult(config, result)).toEqual([
      "europepmc",
      "MED",
      "query:machine learning",
      "year:2026",
      "journal:Example Journal",
      "open-access",
      "in-epmc",
      "author:Ada Lovelace",
      "author:Grace Hopper",
    ]);
    expect(matchesConfiguredFilters({ ...config, localQuery: "epilepsy" }, result)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, localQuery: "does-not-match" }, result)).toBe(false);
    expect(matchesFilters(config, result, { labels_all: ["europepmc", "open-access"] })).toBe(true);
  });

  it("normalizes flags and timestamps", () => {
    expect(truthyFlag("Y")).toBe(true);
    expect(truthyFlag("N")).toBe(false);
    expect(toIso("2026-05-29")).toBe("2026-05-29T00:00:00.000Z");
    expect(toIso(undefined)).toBeUndefined();
  });
});
