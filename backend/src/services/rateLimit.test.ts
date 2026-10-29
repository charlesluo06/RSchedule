// Covers the rate limiter's two behaviors that matter operationally: it
// blocks past the cap, and it fails open when Redis errors (so an Upstash
// outage or quota overrun can't take the whole API down).
import { beforeEach, describe, expect, it, vi } from "vitest";

const incr = vi.fn();
const expire = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ incr, expire }) },
}));

const { isWithinRateLimit } = await import("./rateLimit.js");

describe("isWithinRateLimit", () => {
  beforeEach(() => {
    incr.mockReset();
    expire.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("allows requests up to the cap and blocks the one after", async () => {
    incr.mockResolvedValueOnce(600).mockResolvedValueOnce(601);
    expect(await isWithinRateLimit("1.2.3.4")).toBe(true);
    expect(await isWithinRateLimit("1.2.3.4")).toBe(false);
  });

  it("starts the window expiry only on the first request", async () => {
    incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await isWithinRateLimit("1.2.3.4");
    await isWithinRateLimit("1.2.3.4");
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("ratelimit:1.2.3.4", 60);
  });

  it("fails open when Redis throws", async () => {
    incr.mockRejectedValueOnce(new Error("quota exceeded"));
    expect(await isWithinRateLimit("1.2.3.4")).toBe(true);
  });
});
