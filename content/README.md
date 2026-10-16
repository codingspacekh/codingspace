# Content

Source content for the site. `npm run content:import` (M2) loads it into the database;
from M3 on, new content is written in the admin editor instead.

**Everything here marked `dummy: true` is placeholder content** — replace it with real
lessons, then delete the dummy files.

## Layout

| Path                        | What                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `sections.json`             | Sections inside each subject (`math`, `physics`, `coding`, `it`) |
| `projects.json`             | Project cards; `landingUrl` must be `https://`                   |
| `profile.json`              | Author page: bio, stats, timeline                                |
| `featured-problems.json`    | Problem of the week per subject                                  |
| `posts/<subject>/<slug>.md` | Lessons                                                          |
| `posts/life/<slug>.md`      | Life posts (shown on the Author page)                            |

## Post format

```markdown
---
title: The AM–GM inequality
summary: One line shown on cards and in search results.
section: inequalities # lessons only; a slug from sections.json
sort: 1 # order inside the section
level: 1 # 1 = intro, 2 = core, 3 = contest
lang: en # en or km
dummy: true
---

Body in Markdown. Maths: $inline$ and $$display$$. Code: fenced blocks with a language.
Callouts: a blockquote starting with [!NOTE], [!CONTEST-TIP], [!EXAM-TIP] or [!WARNING].
```

The file name is the slug: lowercase letters, digits and hyphens.
