// Reads product JSON files from content/products/, writes catalog.json,
// and injects SEO + catalog data into index.html.
// Run by Netlify on every deploy (netlify.toml) or locally for testing.

const { readFileSync, writeFileSync, existsSync, readdirSync } = require('fs');
const { resolve, basename } = require('path');

const ROOT     = resolve(__dirname, '..');
const settings = JSON.parse(readFileSync(resolve(ROOT, 'settings.json'), 'utf8'));

// ── Products ──────────────────────────────────────────────────────────────────

function readProducts() {
  const dir = resolve(ROOT, 'content', 'products');
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(filename => {
      const raw = JSON.parse(readFileSync(resolve(dir, filename), 'utf8'));
      return {
        id:          basename(filename, '.json'),
        title:       raw.title       || '',
        description: raw.description || '',
        price:       Number(raw.price) || 0,
        categories:  Array.isArray(raw.categories) ? raw.categories : [],
        variations:  (raw.variations || []).map(v => ({
          name:  v.name  || '',
          price: Number(v.price) || 0,
        })),
        images: Array.isArray(raw.images) ? raw.images : [],
      };
    })
    .filter(p => p.title);
}

// ── SEO injection ─────────────────────────────────────────────────────────────

function buildJsonLd(products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.title,
        description: p.description,
        image: p.images[0] || '',
        offers: {
          '@type': 'Offer',
          price: p.price,
          priceCurrency: settings.currency,
          availability: 'https://schema.org/InStock',
        },
      },
    })),
  };
}

function injectSEO(products) {
  const indexPath = resolve(ROOT, 'index.html');
  if (!existsSync(indexPath)) {
    console.log('  index.html not found — skipping SEO injection.');
    return;
  }

  const siteConfig = {
    storeName:      settings.storeName,
    whatsappNumber: settings.whatsappNumber,
    currency:       settings.currency,
    queueFolderUrl: settings.queueFolderUrl,
  };

  const block = [
    '<!-- CATALOG_DATA_START -->',
    `<script>window.__SITE__=${JSON.stringify(siteConfig)};</script>`,
    `<script type="application/json" id="catalog-data">${JSON.stringify({ products })}</script>`,
    `<script type="application/ld+json">${JSON.stringify(buildJsonLd(products))}</script>`,
    '<!-- CATALOG_DATA_END -->',
  ].join('\n');

  let html = readFileSync(indexPath, 'utf8');

  if (html.includes('<!-- CATALOG_DATA_START -->')) {
    html = html.replace(/<!-- CATALOG_DATA_START -->[\s\S]*?<!-- CATALOG_DATA_END -->/, block);
  } else {
    html = html.replace('</head>', `${block}\n</head>`);
  }

  writeFileSync(indexPath, html, 'utf8');
  console.log('  SEO data injected into index.html');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('Reading products from content/products/...');
  const products = readProducts();
  console.log(`  ${products.length} products found`);

  const catalogPath = resolve(ROOT, 'catalog.json');
  const existing = existsSync(catalogPath)
    ? JSON.parse(readFileSync(catalogPath, 'utf8'))
    : null;

  if (existing && JSON.stringify(existing.products) === JSON.stringify(products)) {
    console.log('No changes — catalog is up to date.');
    return;
  }

  console.log('Writing catalog.json...');
  writeFileSync(
    catalogPath,
    JSON.stringify({ updated: new Date().toISOString(), products }, null, 2),
    'utf8'
  );

  injectSEO(products);
  console.log('Done.');
}

main();
