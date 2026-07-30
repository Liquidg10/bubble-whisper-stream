# Dependency advisory disposition — 2026-07-28

This is a point-in-time reachability record for the six GitHub advisories that
remain after patch-level lock refreshes. It is not a claim that the vulnerable
packages have been upgraded.

| Advisory | Current reachability | Disposition |
|---|---|---|
| `GHSA-mh99-v99m-4gvg` | `brace-expansion` is reached only through ESLint, TypeScript-ESLint, and Tailwind/Sucrase/Glob tooling. It is absent from the browser artifact. | Defer to an isolated tooling-chain upgrade. Do not pass untrusted glob patterns to repository tooling. |
| `GHSA-67mh-4wv8-2f99` | The vulnerable esbuild version is under Vite. This repository does not call esbuild's `serve` API, and esbuild is absent from the browser artifact. | Defer to an isolated Vite compatibility upgrade. |
| `GHSA-4w7w-66w2-5vf9` | Vite development-server optimized-source-map path. The default host is now loopback. | Mitigated for the supported default; a major Vite upgrade remains. |
| `GHSA-v6wh-96g9-6wx3` | Windows UNC/open-in-editor development-server path. The default host is now loopback. | Mitigated for the supported default; Windows review and Vite upgrade remain. |
| `GHSA-fx2h-pf6j-xcff` | Windows filesystem-deny bypass on a network-exposed Vite development server. The default host is now loopback. | Mitigated for the supported default; Windows review and Vite upgrade remain. |
| `GHSA-qwww-vcr4-c8h2` | The React Router package is shipped, but the advisory applies only to unstable RSC APIs. Bubble OS is a BrowserRouter SPA and contains no RSC API use. | Not applicable to the current execution mode; recheck when a compatible fixed release exists. |

`VITE_DEV_HOST` is an explicit escape hatch for hosted development. A
non-loopback value emits a security warning and reopens network exposure; it
must not be used on an untrusted network.

Re-review this record when any of the following occurs:

- React Router publishes and the app adopts a compatible fixed line;
- Vite or the build pipeline receives a compatibility upgrade;
- server rendering, RSC, esbuild `serve`, or user-supplied glob processing is
  introduced;
- the browser bundle composition changes;
- development must run on Windows or bind beyond loopback.
