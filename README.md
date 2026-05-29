# animus-subject-europepmc-publications

Animus subject backend for Europe PMC publications.

The plugin queries the Europe PMC RESTful Web Service, maps publication search results into Animus subjects, and supports local filtering by status, assignee, labels, and update time.

## Configuration

All settings are optional.

| Environment variable | Description |
| --- | --- |
| `EUROPEPMC_QUERY` | Europe PMC search query. Defaults to `machine learning`. |
| `EUROPEPMC_SORT` | Europe PMC sort expression. |
| `EUROPEPMC_RESULT_TYPE` | Result type, such as `core` or `lite`. |
| `EUROPEPMC_API_URL` | API base URL. Defaults to `https://www.ebi.ac.uk/europepmc/webservices/rest`. |
| `EUROPEPMC_LOCAL_QUERY` | Local text query applied after fetch. |
| `EUROPEPMC_LIMIT` | Maximum publications to fetch, 1-1000. Defaults to `50`. |

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run manifest
```

## Install

```bash
animus plugin install launchapp-dev/animus-subject-europepmc-publications
```
