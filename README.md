# Stellate Config Preview

Preview the impact of new or updated caching rules on your existing operations.

This GitHub Action runs the stellate cli `config preview` command and comments
on your PRs with the detected changes and a link to your dashboard to view the
impacted operations.

<img width="916" alt="Screenshot 2023-09-11 at 13 49 21" src="https://github.com/StellateHQ/config-preview-action/assets/2750170/c40ddd3d-caa6-4c3b-8871-46bfc662184e">

## Usage

The config preview action needs to be after the checkout action in order for the Stellate config file to be present.

> [!IMPORTANT]  
> Write access needs to be granted for the `pull-requests` scope and also read
> access for `contents` scope.

> [!WARNING]
> This action only works for pull_request events.

```yaml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  stellate-config-preview:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: StellateHQ/config-preview-action@v1.0.0
        with:
          stellate-token: ${{ secrets.STELLATE_TOKEN }}
```

## Configuration

### `stellate-token`

**Required** A Stellate token for access.

Head to your [Access Tokens](https://stellate.co/app/settings/access-tokens)
page, click the Create a token button, and name the new token. Make sure also to
copy the token to a safe place; you won't be able to see it again.

<img width="722" alt="Screenshot 2023-09-11 at 14 50 19" src="https://github.com/StellateHQ/config-preview-action/assets/2750170/71867b7b-81aa-4a7a-87ec-917d127ac131">

### `repo-token`

**Required** A GitHub token for API access. Defaults to `{{ github.token }}`.
