# Security policy

Report security vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/rwv/s3-artifact/security/advisories/new). Do not include storage credentials or artifact contents in public issues.

The latest 0.x release receives fixes during the initial development phase. Prefer exact release versions or commit SHAs for production workflows.

Use private storage and HTTPS. Scope credentials to intended buckets. Forked PRs should not receive production storage credentials. Repository/run prefixes are naming isolation, not an authorization boundary when credentials can access the whole bucket.
