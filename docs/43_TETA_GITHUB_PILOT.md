# Teta public catalog pilot through GitHub Actions

Status: **manual-only; not yet run**.

## Purpose

Run the existing conservative public-HTML collector from GitHub Actions when local access to the repository is unavailable. The workflow produces a research JSON dataset and a concise summary report as downloadable artifacts. It does not write to the ANITKA database, deploy the app, schedule recurring collection, or import prices.

## Safety gates

- The workflow has only a `workflow_dispatch` trigger. Pushes, pull requests, and scheduled runs do not start collection.
- The confirmation input defaults to `false`; the workflow exits before checkout or network collection unless the operator explicitly confirms that the current Teta robots.txt and terms have been reviewed and that this limited collection is permitted.
- The collector itself re-checks `robots.txt` before each page and stops if it cannot verify the file or if the requested path is disallowed.
- Only the existing public HTML collector is used. It does not call internal APIs or inventory/price endpoints.
- The run is bounded to at most 2 catalog pages and 40 product details, with a delay of at least 1.5 seconds between requests.
- Results are research-only. E-shop prices must not be represented as physical-store prices, and ambiguous prices must not be imported.
- Artifacts are retained for 14 days. Do not put secrets in the output.

## How to run it later

1. Open the repository's **Actions** tab.
2. Select **Manual Teta public catalog pilot**.
3. Choose **Run workflow** on the default branch.
4. Run it only after reviewing Teta's then-current robots.txt and terms and confirming that the intended access is permitted. If this cannot be confirmed, leave the checkbox unchecked and do not run.
5. Open the completed run and download the `teta-public-catalog-pilot` artifact.
6. Review the Markdown summary and JSON dataset before changing parser behavior or considering any ingestion work.

## What the report checks

Names, source product codes, EAN/GTIN coverage, products with price candidates, total and unclassified price candidates, missing EANs, and parser warnings. These are extraction diagnostics, not proof that the dataset is complete or commercially authoritative.
