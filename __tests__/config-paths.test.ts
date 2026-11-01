import { describe, expect, test } from "bun:test";
import { configPaths } from "../src/config";

describe("configPaths", () => {
  test("builds global and project config paths for POSIX home", () => {
    expect(configPaths("/home/markus", "/home/markus/projects/app")).toEqual([
      "/home/markus/.config/opencode/opencode.json",
      "/home/markus/.config/opencode/opencode.jsonc",
      "/home/markus/projects/app/opencode.json",
      "/home/markus/projects/app/.opencode/opencode.json",
    ]);
  });

  test("normalises Windows-style directories to forward slashes", () => {
    expect(
      configPaths("C:\\Users\\marku", "C:\\Users\\marku\\code\\app"),
    ).toEqual([
      "C:/Users/marku/.config/opencode/opencode.json",
      "C:/Users/marku/.config/opencode/opencode.jsonc",
      "C:/Users/marku/code/app/opencode.json",
      "C:/Users/marku/code/app/.opencode/opencode.json",
    ]);
  });
});