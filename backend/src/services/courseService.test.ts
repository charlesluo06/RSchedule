// Covers the failure-mode behavior of the cache-first service functions:
// a broken Redis must degrade to "fetch from UCR" (not an error), and a UCR
// failure must be tagged so routes can answer 502 instead of 500.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({
  getCachedBundles: vi.fn(),
  getCachedSeats: vi.fn(),
  setCachedBundles: vi.fn(),
  setCachedSeats: vi.fn(),
  getCachedSubjects: vi.fn(),
  setCachedSubjects: vi.fn(),
  getCachedCourseCodes: vi.fn(),
  setCachedCourseCodes: vi.fn(),
  getCachedAttributes: vi.fn(),
  setCachedAttributes: vi.fn(),
}));
const ucr = vi.hoisted(() => ({
  fetchCourseBundles: vi.fn(),
  fetchSubjects: vi.fn(),
  fetchCourseCodesForSubject: vi.fn(),
  fetchSectionAttributes: vi.fn(),
}));

vi.mock("./cache.js", () => ({
  ...cache,
  applySeats: (bundles: unknown) => bundles,
  extractSeatsByCrn: () => ({}),
}));
vi.mock("./ucrClient.js", () => ucr);

const { getCourseBundles, getSubjects, UcrUnavailableError } = await import("./courseService.js");

const BUNDLES = [{ courseCode: "CS141", sections: [] }];

describe("courseService failure modes", () => {
  beforeEach(() => {
    for (const fn of [...Object.values(cache), ...Object.values(ucr)]) fn.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("falls through to UCR when the Redis cache read throws", async () => {
    cache.getCachedBundles.mockRejectedValue(new Error("redis down"));
    cache.getCachedSeats.mockRejectedValue(new Error("redis down"));
    cache.setCachedBundles.mockRejectedValue(new Error("redis down"));
    cache.setCachedSeats.mockRejectedValue(new Error("redis down"));
    ucr.fetchCourseBundles.mockResolvedValue(BUNDLES);

    await expect(getCourseBundles("CS141", "202710")).resolves.toEqual(BUNDLES);
    expect(ucr.fetchCourseBundles).toHaveBeenCalledOnce();
  });

  it("serves from cache without touching UCR when the cache is healthy", async () => {
    cache.getCachedBundles.mockResolvedValue(BUNDLES);
    cache.getCachedSeats.mockResolvedValue({});

    await expect(getCourseBundles("CS141", "202710")).resolves.toEqual(BUNDLES);
    expect(ucr.fetchCourseBundles).not.toHaveBeenCalled();
  });

  it("tags a UCR failure as UcrUnavailableError when there is no cache to fall back on", async () => {
    cache.getCachedBundles.mockRejectedValue(new Error("redis down"));
    cache.getCachedSeats.mockRejectedValue(new Error("redis down"));
    ucr.fetchCourseBundles.mockRejectedValue(new Error("UCR search failed with status 503"));

    await expect(getCourseBundles("CS141", "202710")).rejects.toBeInstanceOf(UcrUnavailableError);
  });

  it("serves stale cached bundles when UCR fails but the cache has them", async () => {
    cache.getCachedBundles.mockResolvedValue(BUNDLES);
    cache.getCachedSeats.mockResolvedValue(null);
    ucr.fetchCourseBundles.mockRejectedValue(new Error("UCR down"));

    await expect(getCourseBundles("CS141", "202710")).resolves.toEqual(BUNDLES);
  });

  it("subjects: Redis read failure falls through to UCR", async () => {
    cache.getCachedSubjects.mockRejectedValue(new Error("redis down"));
    cache.setCachedSubjects.mockRejectedValue(new Error("redis down"));
    ucr.fetchSubjects.mockResolvedValue([{ code: "CS", description: "Computer Science" }]);

    await expect(getSubjects("202710")).resolves.toEqual([{ code: "CS", description: "Computer Science" }]);
  });

  it("subjects: UCR failure is tagged UcrUnavailableError", async () => {
    cache.getCachedSubjects.mockResolvedValue(null);
    ucr.fetchSubjects.mockRejectedValue(new Error("boom"));

    await expect(getSubjects("202710")).rejects.toBeInstanceOf(UcrUnavailableError);
  });
});
