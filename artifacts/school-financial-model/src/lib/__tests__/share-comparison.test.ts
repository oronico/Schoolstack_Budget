import { describe, expect, it } from "vitest";
import {
  buildCompareShareUrl,
  decodeCompareKeysFromHash,
  encodeCompareKeysToHash,
  MAX_COMPARE_KEYS,
} from "../share-comparison";

describe("share-comparison codec", () => {
  it("round-trips a typical 2-key selection", () => {
    const keys = [
      "Alameda site|2025-09-01T12:00:00.000Z",
      "Berkeley site|2025-09-02T08:30:00.000Z",
    ];
    const hash = encodeCompareKeysToHash(keys);
    expect(hash.startsWith("compare=")).toBe(true);
    expect(decodeCompareKeysFromHash(hash)).toEqual(keys);
  });

  it("survives commas, pipes, and unicode in scenario names", () => {
    const keys = [
      "Bay Area, Phase 1|2025-09-01T00:00:00.000Z",
      "École Montessori — étoile|2025-09-02T00:00:00.000Z",
      "K|5 stretch|2025-09-03T00:00:00.000Z",
    ];
    const hash = encodeCompareKeysToHash(keys);
    expect(decodeCompareKeysFromHash(hash)).toEqual(keys);
  });

  it("accepts a `#`-prefixed hash and ignores neighbouring params", () => {
    const keys = ["A|t1", "B|t2"];
    const hash = `#whatif=open&${encodeCompareKeysToHash(keys)}&other=foo`;
    expect(decodeCompareKeysFromHash(hash)).toEqual(keys);
  });

  it("returns an empty list for missing / unrelated hashes", () => {
    expect(decodeCompareKeysFromHash("")).toEqual([]);
    expect(decodeCompareKeysFromHash("#")).toEqual([]);
    expect(decodeCompareKeysFromHash("#whatif=e:1,0,0,0,0")).toEqual([]);
  });

  it("drops empty keys when encoding and ignores blank entries when decoding", () => {
    expect(encodeCompareKeysToHash(["A|t1", "  ", ""])).toBe(
      `compare=${encodeURIComponent("A|t1")}`,
    );
    expect(decodeCompareKeysFromHash("compare=,,A%7Ct1,,")).toEqual(["A|t1"]);
  });

  it("caps the number of keys at MAX_COMPARE_KEYS on both sides", () => {
    const tooMany = ["a|1", "b|2", "c|3", "d|4", "e|5", "f|6"];
    const hash = encodeCompareKeysToHash(tooMany);
    const decoded = decodeCompareKeysFromHash(hash);
    expect(decoded).toHaveLength(MAX_COMPARE_KEYS);
    expect(decoded).toEqual(tooMany.slice(0, MAX_COMPARE_KEYS));
  });

  it("returns an empty string when nothing is selected", () => {
    expect(encodeCompareKeysToHash([])).toBe("");
    expect(encodeCompareKeysToHash(["", "  "])).toBe("");
  });

  it("skips malformed escape sequences but keeps surrounding keys", () => {
    // `%E0%A4%A` is an incomplete UTF-8 escape that throws in
    // decodeURIComponent. The valid neighbour should still come through.
    const hash = `compare=%E0%A4%A,${encodeURIComponent("Good|t1")}`;
    expect(decodeCompareKeysFromHash(hash)).toEqual(["Good|t1"]);
  });

  it("builds an absolute URL preserving pathname and search", () => {
    const url = buildCompareShareUrl(["A|t1", "B|t2"], {
      origin: "https://app.example.com",
      pathname: "/scenarios",
      search: "?outcome=pursued",
    });
    expect(url).toBe(
      `https://app.example.com/scenarios?outcome=pursued#${encodeCompareKeysToHash([
        "A|t1",
        "B|t2",
      ])}`,
    );
  });

  it("omits the hash entirely when there are no keys", () => {
    const url = buildCompareShareUrl([], {
      origin: "https://app.example.com",
      pathname: "/scenarios",
      search: "",
    });
    expect(url).toBe("https://app.example.com/scenarios");
  });
});
