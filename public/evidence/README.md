# Security evidence images

Save owner-captured screenshots here using these exact filenames:

- `S1-unauth-function.png`
- `S2-cross-tenant.png`
- `S3-stored-xss.png`
- `S4-connect-input.png`
- `S5-auth-abuse.png`
- `S6-resilience.png`

`node scripts/build-security-pdf.mjs` embeds images that exist and leaves a labelled placeholder for each missing image. Do not include tokens, cookies, passwords, private Moodle data, or another user's data in screenshots.
