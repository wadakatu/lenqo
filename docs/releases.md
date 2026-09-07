# Release Lenqo

The first npm release (`0.1.0`) was published locally after npm's interactive authentication and fresh-install verification. It has no GitHub build provenance. New releases use `.github/workflows/publish.yml`: test and pack without publish credentials, then upload that exact tarball in a separate OIDC job. A maintainer approves the candidate on npm before it becomes public.

## One-time trust setup

The npm package owner configures a GitHub Trusted Publisher for:

- Package: `lenqo`
- Repository: `wadakatu/lenqo`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Permission: **stage publish only**, not direct publish

With npm 11.15+ and an account with 2FA:

```sh
npm trust github lenqo --repo wadakatu/lenqo --file publish.yml --environment npm --allow-stage-publish
```

Configure the GitHub environment `npm` to accept only the `main` branch. The workflow also checks the repository and branch. Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN` secrets. After verifying the first OIDC candidate upload, set the package's Publishing access to **Require two-factor authentication and disallow tokens** on npm. This setting still permits Trusted Publishers. Do not revoke unrelated account credentials.

Trust configuration is an external setting: committing the workflow does not enable it. A successful validation-only run does not prove OIDC works; verify a real staged upload on the next version.

## Each release

1. Update package and lockfile versions together, and update the changelog. Review changes and land them on `main`.
2. Run the workflow from `main` with the exact version. Default `stage=false` tests everything without uploading to npm:

   ```sh
   gh workflow run publish.yml --ref main -f version=0.1.1 -f stage=false
   ```

3. When ready, run it again with `stage=true`. It reruns tests, packs once, tests that exact tarball in a clean consumer, and passes it to a fresh stage job. Actions are pinned by full commit SHA. Release jobs do not restore shared caches; dependencies are installed with lifecycle scripts disabled in the test job. Only the stage job has `id-token: write`, and it never installs or executes package dependencies. It verifies the tarball checksum and uploads with scripts disabled and provenance enabled.
4. Inspect the workflow's commit, package manifest, checksum, and npm candidate. The CI identity cannot approve its own candidate:

   ```sh
   npm stage list lenqo
   npm stage view <stage-id>
   npm stage approve <stage-id>
   ```

   Approval requires the maintainer's npm authentication. `npm stage reject <stage-id>` discards an incorrect candidate; do not approve to work around failed verification. Staging itself is not a public release.
5. Confirm the new version and provenance on npm. Run `npm run test:install -- --registry` at that version's source revision, then create a matching immutable Git tag/GitHub release. Never move an existing release tag or try to replace an already published npm version; fix forward with a new version.

The `version` input does not edit package.json. It must match the checked-out source exactly. The workflow currently handles stable `X.Y.Z` releases; prereleases require an explicit dist-tag strategy first.

## Limits

Provenance links an artifact to its source and workflow; it is not a claim that the code is free of vulnerabilities. Keep dependency/Actions updates reviewed, restrict repository write access, protect release history, and keep maintainer accounts secured with 2FA/passkeys. A malicious maintainer or compromised source can still produce harmful packages, so review the staged artifact before approval.

Sources: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [npm staged publishing](https://docs.npmjs.com/staged-publishing/), [npm trust CLI](https://docs.npmjs.com/cli/v11/commands/npm-trust/), [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use), [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
