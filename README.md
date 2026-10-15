# CodingSpace

Source for **[codingspace.io](https://codingspace.io)**: lessons in competition mathematics, physics, coding and Cambridge AS & A Level Computer Science (9618) and IT (9626), plus the tools built for those classes.

Built with Next.js (Pages Router), React 18, [Arwes](https://github.com/arwes/arwes) for the sci-fi interface, and Supabase. Developed test-first.

## Documentation

| Doc                                                      | What it covers                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [docs/03-system-analysis.md](docs/03-system-analysis.md) | Requirements, architecture, security, performance, TDD process (current baseline) |
| [docs/04-milestones.md](docs/04-milestones.md)           | Build order (M0–M7) and the tests that define each milestone                      |
| [docs/adr/](docs/adr/)                                   | Architecture decision records                                                     |

## Run it locally

Requirements: Node 22+, and a Docker runtime (e.g. [Colima](https://github.com/abiosoft/colima)) for the local database.

```bash
npm install                 # also applies the Arwes safe-math patch
cp .env.example .env.local  # fill in values from `npm run db:start`
npm run dev                 # http://localhost:3000
```

## Tests

```bash
npm run check          # types, lint, formatting, unit tests
npm run test:coverage  # unit + component tests with coverage gates
npm run test:e2e       # Playwright + axe against a production build
npm run db:start       # local Supabase (Docker)
npm run db:test        # pgTAP row-level-security tests
```

Every pull request runs the same gates in GitHub Actions. A red check blocks the merge.

## Security

Please report security issues privately via GitHub's **Report a vulnerability** (Security tab), not in public issues.

## Licence

All rights reserved. The code is public for transparency and learning, but it is not licensed for reuse.
