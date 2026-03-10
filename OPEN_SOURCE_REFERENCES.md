# Open Source References

Last verified: 2026-03-10

This file is the canonical reference list for external repositories previously mirrored locally.

## External Repositories

| Previous local folder | Canonical GitHub URL | Verification |
|---|---|---|
| `chatbot_ui_ext` | https://github.com/mckaywrigley/chatbot-ui | HTTP 200 on 2026-03-10 |
| `grok_prompts_repo` | https://github.com/xai-org/grok-prompts | HTTP 200 on 2026-03-10 |
| `librechat_ext` | https://github.com/danny-avila/LibreChat | HTTP 200 on 2026-03-10 |
| `open_webui_ext` | https://github.com/open-webui/open-webui | HTTP 200 on 2026-03-10 |
| `openclaw_repo` | https://github.com/openclaw/openclaw | HTTP 200 on 2026-03-10 |
| `opencode_repo` | https://github.com/anomalyco/opencode | HTTP 200 on 2026-03-10 |
| `react_grab_repo` | https://github.com/aidenybai/react-grab | HTTP 200 on 2026-03-10 |
| `storm` | https://github.com/stanford-oval/storm | HTTP 200 on 2026-03-10 |
| `t3code_repo` | https://github.com/pingdotgg/t3code | HTTP 200 on 2026-03-10 |
| `vercel_chatbot_ext` | https://github.com/vercel/chatbot | HTTP 200 on 2026-03-10 |
| `science/asreview` | https://github.com/asreview/asreview | HTTP 200 on 2026-03-10 |
| `science/citeproc-js` | https://github.com/Juris-M/citeproc-js | HTTP 200 on 2026-03-10 |
| `science/colandr-back` | https://github.com/datakind/permanent-colandr-back | HTTP 200 on 2026-03-10 |
| `science/fiduswriter` | https://github.com/fiduswriter/fiduswriter | HTTP 200 on 2026-03-10 |
| `science/grobid` | https://github.com/grobidOrg/grobid | HTTP 200 on 2026-03-10 (redirect from `kermitt2/grobid`) |
| `science/manubot` | https://github.com/manubot/manubot | HTTP 200 on 2026-03-10 |
| `science/manuscripts-article-editor` | https://github.com/Atypon-OpenSource/manuscripts-article-editor | HTTP 200 on 2026-03-10 |
| `science/ojs` | https://github.com/pkp/ojs | HTTP 200 on 2026-03-10 |
| `science/osf-io` | https://github.com/CenterForOpenScience/osf.io | HTTP 200 on 2026-03-10 |
| `science/prismaid` | https://github.com/open-and-sustainable/prismaid | HTTP 200 on 2026-03-10 |
| `science/quarto-cli` | https://github.com/quarto-dev/quarto-cli | HTTP 200 on 2026-03-10 |
| `science/reviewaid` | https://github.com/aurumz-rgb/ReviewAid | HTTP 200 on 2026-03-10 |
| `science/zotero` | https://github.com/zotero/zotero | HTTP 200 on 2026-03-10 |

## Refresh Procedure

Use this check before future cleanup or onboarding updates:

```bash
for url in $(awk -F'|' '/https:\/\/github.com\// {gsub(/ /, "", $3); print $3}' OPEN_SOURCE_REFERENCES.md); do
  curl -L --max-time 12 -s -o /dev/null -w "%{http_code} %{url_effective}\n" "$url"
done
```
