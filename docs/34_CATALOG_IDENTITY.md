# Shopping_Buddy — Product catalog identity

## Purpose

The curated seed catalog contains product-family information that must remain separate from the canonical product name. The live catalog therefore keeps identity attributes independently:

- `products.name` — human-readable canonical product name
- `products.brand` — brand when confidently known
- `products.variant` — differentiating variant/specification when confidently known
- `product_packages.quantity + unit` — total consumer-package size in canonical comparison units
- `product_packages.package_count` — number of inner consumer units when explicitly known
- `product_packages.package_unit_quantity + package_unit` — size of one inner consumer unit when explicitly known
- `product_packages.package_type` — source classification such as `multipack`

## Identity rules

A product must not be created merely because a seed row has a display string.

The importer must first resolve:

1. existing stable external identity, when available;
2. existing canonical product identity with compatible brand/variant;
3. otherwise create a new canonical product only from a `ready` seed row.

Brand or variant must remain null when the source does not establish them confidently. They must not be guessed from a retailer name, category, or package text.

## Package rules

`quantity + unit` is the total consumer-package size used for comparison.

For an explicit multipack such as `10 × 14 g`, store:

- total size: `0.14 kg`
- `package_count = 10`
- `package_unit_quantity = 0.014`
- `package_unit = kg`
- `package_type = multipack`

The inner-unit fields are optional and are only populated when the source explicitly gives the information. Existing price-derived package rows remain valid with these fields null.

## Safety

This migration is additive. It does not rewrite existing product names, merge existing products, or alter existing prices/deals. Seed import and reconciliation remain separate work so existing household history stays stable.
