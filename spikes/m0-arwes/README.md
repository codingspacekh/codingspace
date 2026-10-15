# M0 spike: Arwes + Next.js (throwaway)

Result: **GO**. See `../../docs/adr/0001-arwes.md`.

```bash
npm install            # also applies the Arwes safe-math patch (postinstall)
npm run test:unit      # 3 unit tests (safe-math + patch check)
npx playwright test    # 15 browser tests against a production build
npm run build && npm start   # http://localhost:3100  (/ , /lesson , /plain = control page)
```

`../m0-arwes-r19/` is the same spike on React 19.1 (compatibility experiment; all tests pass).
Screenshots of the result are in `screenshots/`.
