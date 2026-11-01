// Type shim: redirect solid-js/dist/solid.js to the real solid-js types.
// The test file imports the reactive build directly (dist/solid.js) because
// bun resolves solid-js to dist/server.js (non-reactive) under the node
// condition. This shim gives tsc the correct types for that import path.
declare module "solid-js/dist/solid.js" {
  export * from "solid-js";
}
