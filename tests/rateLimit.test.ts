import { afterEach, expect, setSystemTime, test } from "bun:test";
import { SlidingWindowRateLimiter } from "../src/rateLimit";

afterEach(() => {
  setSystemTime();
});

test("allows up to max hits, then blocks", () => {
  const limiter = new SlidingWindowRateLimiter(3, 1000);
  expect(limiter.hit("ip-1")).toBe(false);
  expect(limiter.hit("ip-1")).toBe(false);
  expect(limiter.hit("ip-1")).toBe(false);
  expect(limiter.hit("ip-1")).toBe(true);
  // Other keys are independent.
  expect(limiter.hit("ip-2")).toBe(false);
});

test("window slides: old hits expire and free up capacity", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  setSystemTime(start);

  const limiter = new SlidingWindowRateLimiter(2, 1000);
  expect(limiter.hit("ip-1")).toBe(false);

  setSystemTime(new Date(start.getTime() + 600));
  expect(limiter.hit("ip-1")).toBe(false);
  expect(limiter.hit("ip-1")).toBe(true);

  // 1001ms after the first hit it falls out of the window; one slot frees up.
  setSystemTime(new Date(start.getTime() + 1001));
  expect(limiter.hit("ip-1")).toBe(false);
  expect(limiter.hit("ip-1")).toBe(true);
});

test("a blocked hit does not extend the window", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  setSystemTime(start);

  const limiter = new SlidingWindowRateLimiter(1, 1000);
  expect(limiter.hit("ip-1")).toBe(false);
  expect(limiter.hit("ip-1")).toBe(true);

  // The rejected attempt above must not count; after the window the key is free.
  setSystemTime(new Date(start.getTime() + 1001));
  expect(limiter.hit("ip-1")).toBe(false);
});

test("cleanup drops keys whose hits all expired", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  setSystemTime(start);

  const limiter = new SlidingWindowRateLimiter(5, 1000);
  limiter.hit("ip-1");
  limiter.hit("ip-2");
  expect(limiter.size).toBe(2);

  setSystemTime(new Date(start.getTime() + 500));
  limiter.hit("ip-2");

  setSystemTime(new Date(start.getTime() + 1200));
  limiter.cleanup();
  // ip-1's only hit expired; ip-2 still has one inside the window.
  expect(limiter.size).toBe(1);

  setSystemTime(new Date(start.getTime() + 2000));
  limiter.cleanup();
  expect(limiter.size).toBe(0);
});
