# Publishing sas-box

Publishing is always an explicit maintainer action. None of the package scripts
publish or create authentication configuration.

1. Verify the exact checkout:

   ```sh
   npm run check
   git status --short
   ```

2. Preview the package and inspect the listed files:

   ```sh
   npm pack --dry-run
   ```

3. Create the release artifact locally:

   ```sh
   mkdir -p .artifacts
   npm pack --pack-destination .artifacts
   ```

4. Authenticate locally and verify the account:

   ```sh
   npm login --registry https://registry.npmjs.org/
   npm whoami --registry https://registry.npmjs.org/
   ```

5. Publish the inspected tarball explicitly:

   ```sh
   npm publish ./.artifacts/sas-box-0.1.0.tgz --access public --registry https://registry.npmjs.org/
   ```

Never put an npm token in repository files, shell transcripts committed to the
repository, or chat. npm supports granular access tokens; legacy access tokens
are no longer supported. For CI releases, prefer an npm trusted publisher using
OIDC instead of a long-lived token when the hosting workflow is ready.

Package names and versions cannot be reused after publication, even if a
release is later unpublished. Confirm the name, version, tag, and tarball before
the final command.

References: [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/),
[access tokens](https://docs.npmjs.com/about-access-tokens/), and
[trusted publishers](https://docs.npmjs.com/trusted-publishers/).
