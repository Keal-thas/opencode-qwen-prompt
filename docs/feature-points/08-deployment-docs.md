# Deployment docs

`SETUP.md` is written to be executed *by an agent* on the target machine (no internet, git-bash on Windows) — copies files in, merges the `agent` config key, optionally installs the viewer plugin, verifies, reports back. `SETUP-walkthrough.zh.md` is a separate Chinese human-facing walkthrough of the same steps, not meant to be executed literally.

**Tested:** indirectly — `tests/unit/config-consistency.test.mjs`'s SETUP.md/example-config drift check is the one piece of SETUP.md's *content* under test. The step-by-step procedure itself can only really be validated by actually running it on the target machine, which is out of reach from here.
