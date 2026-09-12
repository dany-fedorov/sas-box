# Publishing sas-box

Run the checks with Node.js, npm, and Bun installed:

```sh
npm ci
npm run check
npm pack --dry-run
```

Create an artifact after setting the release version in `package.json` and
`package-lock.json`:

```sh
mkdir -p .artifacts
npm pack --pack-destination .artifacts
```

Authenticate with npm, verify the account, and publish the inspected artifact:

```sh
npm login --registry https://registry.npmjs.org/
npm whoami --registry https://registry.npmjs.org/
npm publish ./.artifacts/sas-box-0.1.2.tgz --access public --registry https://registry.npmjs.org/
npm view sas-box@0.1.2 version dist.integrity
```

Use the versioned filename produced by `npm pack` for subsequent releases.
Keep credentials outside the repository.
