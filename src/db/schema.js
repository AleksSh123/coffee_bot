const schemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id TEXT NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      lifecycle_status TEXT NOT NULL DEFAULT 'draft',
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      fulfillment_status TEXT NOT NULL DEFAULT 'pending',
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      fulfilled_at TIMESTAMPTZ,
      CONSTRAINT orders_lifecycle_status_check
        CHECK (lifecycle_status IN ('draft', 'submitted', 'cancelled')),
      CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('unpaid', 'paid')),
      CONSTRAINT orders_fulfillment_status_check
        CHECK (fulfillment_status IN ('pending', 'fulfilled'))
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS orders_one_draft_per_user_idx
      ON orders (user_id)
      WHERE lifecycle_status = 'draft'
  `,
  `
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name_snapshot TEXT NOT NULL,
      category_id TEXT,
      category_name_snapshot TEXT,
      label_name_snapshot TEXT,
      offer_key TEXT NOT NULL,
      offer_name_snapshot TEXT NOT NULL,
      offer_type_snapshot TEXT,
      weight_snapshot INTEGER,
      price_snapshot NUMERIC(12, 2) NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
      CONSTRAINT order_items_order_offer_key_unique UNIQUE (order_id, offer_key)
    )
  `
];

export async function ensureDatabaseSchema(executor) {
  for (const statement of schemaStatements) {
    await executor.query(statement);
  }
}
