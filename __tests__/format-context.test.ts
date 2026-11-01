import { describe, expect, test } from "bun:test";
import { formatContextLength } from "../src/format";

describe("formatContextLength", () => {
  test("formats 1000k as 1m", () => {
    expect(formatContextLength(1_000_000)).toBe("1m");
  });

  test("keeps sub-million contexts in K", () => {
    expect(formatContextLength(400_000)).toBe("400K");
  });
});
