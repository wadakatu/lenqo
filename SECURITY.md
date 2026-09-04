# Security policy

## Supported versions

Security fixes are applied to the latest released version.

## Reporting a vulnerability

Please report vulnerabilities privately through the security advisory feature of the eventual GitHub repository. Do not open a public issue containing exploit details.

## Local-server boundary

Snaplogue is designed for trusted local development. It binds to `127.0.0.1` by default and rejects non-loopback hosts unless `server.allowRemote` is explicitly enabled. The review endpoint is not an authenticated multi-user service and should not be exposed to an untrusted network or deployed publicly.
