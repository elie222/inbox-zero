# Dependency patches

`@sqlite.org__sqlite-wasm@3.54.1-build1.patch` aligns the legacy worker's proxy construction with the primary initializer's static proxy asset URL. Turbopack otherwise treats its dynamic URL as a worker module dependency and fails compilation even when only the package's default SQLite initializer is used. Mail search uses SAHPool; the legacy proxy is not instantiated by the application. Remove after upgrading to a release with the same bundler-compatible legacy worker implementation, and validate with the emulated local search browser suite.
