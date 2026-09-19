# Release automation

`.github/workflows/release.yml`: on a `v*` tag push, publishes the repo to npm via Trusted Publishing, then builds a zip of the repo (including `.git`) and publishes it as a GitHub release — the zip is the mechanism that gets the repo onto the offline target machine (per SETUP.md's "downloaded as a zip" assumption); npm is the second channel the internal npm mirror can pull from instead. The npm publish step must run before the zip build, so the zip's own working-tree artifact can't get swept into the npm tarball. See CLAUDE.md's "Whole-repo npm publish" entry for the full mechanism and current package-name status.

**Untested** — would require actually tagging and pushing a release, which is a real, visible action, not something to trigger from an automated test run.
