import { posix } from "node:path";

// Pure config-path resolution — no runtime globals (Bun/process).
// Extracted here so it can be unit-tested and so the plugin loads in both the
// Bun CLI runtime and the desktop's Node-compiled sidecar, where the global
// `Bun` is not defined and referencing it throws at module load.
// posix.join normalises Windows drive paths to forward slashes, matching
// OpenCode's own path convention (session directories are stored as
// "C:/Users/..." even on Windows).
export function configPaths(home: string, directory: string): string[] {
  // Convert Windows backslashes before joining so output is uniformly
  // forward-slash even when the caller passes "C:\Users\..." style paths.
  const norm = (p: string) => p.replace(/\\/g, "/");
  return [
    posix.join(norm(home), ".config", "opencode", "opencode.json"),
    posix.join(norm(home), ".config", "opencode", "opencode.jsonc"),
    posix.join(norm(directory), "opencode.json"),
    posix.join(norm(directory), ".opencode", "opencode.json"),
  ];
}
