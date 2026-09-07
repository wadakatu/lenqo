# Security policy

## Supported versions

Security fixes are applied to the latest released version.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/wadakatu/lenqo/security/advisories/new). Do not open a public issue containing exploit details.

## Package releases

See [the release workflow](docs/releases.md) for the OIDC stage-only publisher, isolated verification and staging jobs, and npm maintainer approval. No long-lived npm write token is stored in GitHub Actions. Provenance identifies the source/build of future CI releases, not the absence of vulnerabilities; the initial local `0.1.0` release does not have CI provenance.

## Local-server boundary

Lenqo is designed for trusted local development. It binds to `127.0.0.1` by default and rejects non-loopback hosts unless `server.allowRemote` is explicitly enabled. The review endpoint is not an authenticated multi-user service and should not be exposed to an untrusted network or deployed publicly.
