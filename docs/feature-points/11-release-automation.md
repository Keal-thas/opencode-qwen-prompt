# Release automation

`.github/workflows/release.yml`: on a `v*` tag push, builds a zip of the repo (including `.git`) and publishes it as a GitHub release — this is the mechanism that gets the repo onto the offline target machine (per SETUP.md's "downloaded as a zip" assumption).

**Untested** — would require actually tagging and pushing a release, which is a real, visible action, not something to trigger from an automated test run.
