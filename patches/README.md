# Local dependency security patches

## http-cache-semantics 4.3.0

`http-cache-semantics@4.3.0.patch` enforces cache reuse prohibitions before
`max-stale` or `stale-while-revalidate` handling. It preserves normal stale
reuse for public cacheable responses.

Upstream GHSA-ch52-4w7c-c8xp advertises no patched release. Some registry audit
responses claim `>=4.2.1`, but that version is not published, and the problem
also reproduces in published 4.3.0. Do not remove this patch just because a
package audit reports zero findings. The behavior regression in
`tests-js/dependency-security.node-test.mjs` must remain green against any
replacement. pnpm applies the patch from `pnpm-workspace.yaml` and binds its
hash into the generated lockfile. Never hand-edit the lockfile.

## Release-age exceptions

The 14-day minimum release age and version-scoped lifecycle approvals stay
in force. The narrowly scoped exceptions added for this remediation are:

- `@simple-git/argv-parser@2.0.1`: VISUAL editor detection.
- `shell-quote@1.11.0`: reject line terminators after comment tokens.
- `source-map-js@1.2.2`: bound indexed-map offsets and nested amplification.
- `http-cache-semantics@4.3.0`: latest published compatible version, with the
  local mitigation above (not an assertion of an upstream fix).

Their registry integrity and published package diffs were reviewed. None adds
an installation lifecycle script. Do not broaden these selectors or lower
`minimumReleaseAge` to resolve a future install failure.

## Embedded runtime

Electron 41.10.6 clears the original Electron advisories but still embeds
Undici 7.28.0. The minimum selected runtime is Electron 43.7.0, embedding Node
24.21.0 and Undici 7.29.1; it was already outside the release-age window.
`tests-js/electron-runtime-security.node-test.mjs` executes the actual Electron
binary to prevent npm-only audits from concealing an affected embedded copy.
Electron's new downloader also removes the unmaintained `extract-zip` and
`sprintf-js` chains, rather than ignoring their advisories.
