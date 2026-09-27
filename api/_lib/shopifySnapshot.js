const QUERIES = {
  collections: `
    query Collections($cursor: String) {
      collections(first: 250, after: $cursor, sortKey: ID) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id legacyResourceId handle title descriptionHtml updatedAt
          seo { title description }
          image { url altText }
          products(first: 250) { pageInfo { hasNextPage endCursor } nodes { id legacyResourceId handle } }
        }
      }
    }`,
  customers: `
    query Customers($cursor: String) {
      customers(first: 250, after: $cursor, sortKey: ID) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id legacyResourceId firstName lastName displayName email phone state tags note
          createdAt updatedAt numberOfOrders amountSpent { amount currencyCode }
          defaultAddress { address1 address2 city provinceCode zip countryCode phone }
          addresses { address1 address2 city provinceCode zip countryCode phone }
        }
      }
    }`,
  locations: `
    query Locations($cursor: String) {
      locations(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id legacyResourceId name isActive fulfillsOnlineOrders address { address1 address2 city provinceCode zip countryCode phone } }
      }
    }`,
  menus: `
    query Menus($cursor: String) {
      menus(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id handle title items { id title type url resourceId tags items { id title type url resourceId tags } } }
      }
    }`,
  urlRedirects: `
    query UrlRedirects($cursor: String) {
      urlRedirects(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id path target }
      }
    }`,
};

export async function exportShopifySnapshot({ endpoint, token, datasets = Object.keys(QUERIES), fetchImpl = fetch } = {}) {
  if (!endpoint || !token) throw new Error('shopify_snapshot_credentials_missing');
  const output = {};
  for (const dataset of datasets) {
    const query = QUERIES[dataset];
    if (!query) throw new Error(`unsupported_shopify_dataset:${dataset}`);
    let cursor = null;
    const rows = [];const cursors=new Set();
    do {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { cursor } }),
      });
      const payload = await response.json();
      if (!response.ok || payload.errors) {
        const reason = payload.errors?.map((entry) => entry.message).join('; ') || `http_${response.status}`;
        throw new Error(`shopify_snapshot_fetch_failed:${dataset}:${reason}`);
      }
      const connection = payload.data?.[dataset];
      if (!connection) throw new Error(`shopify_snapshot_shape_invalid:${dataset}`);
      if(dataset==='collections'&&connection.nodes?.some(n=>n.products?.pageInfo?.hasNextPage))throw new Error('collection_product_pagination_required');
      rows.push(...(connection.nodes || []));
      cursor = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
      if(connection.pageInfo?.hasNextPage&&(!cursor||cursors.has(cursor)))throw new Error('shopify_snapshot_cursor_invalid');
      if(cursor)cursors.add(cursor);
    } while (cursor);
    output[dataset] = rows;
  }
  return output;
}

export const shopifySnapshotDatasets = Object.freeze(Object.keys(QUERIES));
