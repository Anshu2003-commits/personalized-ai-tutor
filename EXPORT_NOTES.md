# Sanitized source export

This archive contains the current working files, including local progress changes.

Git history, local agent configuration, dependencies, build output, runtime state, quarantine data, and real environment files are excluded. Environment variable names are provided in `.example` files with empty values; copy these to the corresponding filenames and supply your own settings before running or deploying. The legacy MongoDB inspection script now reads MONGODB_URI from the environment.

See README.md for project structure and setup. No credentials are supplied. The original repository was not modified.

Verification: Gitleaks v8.30.1 scanned the staged source with zero findings. Known credential values from excluded tracked environment files were checked against exported text; binary matches to a short default numeric password were reviewed as compiler character tables. Automated checks cannot guarantee detection of every possible secret. Application tests were not run for this source-only export.
