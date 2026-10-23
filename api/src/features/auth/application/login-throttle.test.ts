import { expect, test } from "vitest";
import { LoginThrottle } from "./login-throttle.js";

function throttleAt(clock: { ms: number }, maxAttempts = 2, windowSeconds = 900) {
  return new LoginThrottle({
    maxAttempts,
    windowSeconds,
    now: () => clock.ms,
  });
}

test("Attempts up to the limit pass; the next one returns Retry-After until the window ends", () => {
  const clock = { ms: 0 };
  const throttle = throttleAt(clock);
  expect(throttle.consume(["ip"])).toBeNull();
  expect(throttle.consume(["ip"])).toBeNull();
  expect(throttle.consume(["ip"])).toBe(900);
  clock.ms = 300_500;
  expect(throttle.consume(["ip"])).toBe(600);
});

test("A new window opens after the configured seconds", () => {
  const clock = { ms: 0 };
  const throttle = throttleAt(clock, 1, 60);
  expect(throttle.consume(["doc"])).toBeNull();
  expect(throttle.consume(["doc"])).toBe(60);
  clock.ms = 60_000;
  expect(throttle.consume(["doc"])).toBeNull();
});

test("Any blocked key blocks the attempt, and rejected attempts are not counted", () => {
  const clock = { ms: 0 };
  const throttle = throttleAt(clock, 1, 900);
  expect(throttle.consume(["ip-a", "doc-1"])).toBeNull();
  expect(throttle.consume(["ip-b", "doc-1"])).toBe(900);
  expect(throttle.consume(["ip-b"])).toBeNull();
});
