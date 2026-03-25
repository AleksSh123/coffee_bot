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
      order_context_key TEXT,
      order_context_label TEXT,
      order_context_status TEXT NOT NULL DEFAULT 'open',
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
        CHECK (fulfillment_status IN ('pending', 'fulfilled')),
      CONSTRAINT orders_order_context_status_check
        CHECK (order_context_status IN ('open', 'sent', 'closed'))
    )
  `,
  `
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_context_key TEXT
  `,
  `
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_context_label TEXT
  `,
  `
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_context_status TEXT DEFAULT 'open'
  `,
  `
    UPDATE orders
    SET
      order_context_key = COALESCE(order_context_key, 'legacy'),
      order_context_label = COALESCE(order_context_label, 'Архивный заказ'),
      order_context_status = COALESCE(order_context_status, 'open')
    WHERE order_context_key IS NULL OR order_context_label IS NULL OR order_context_status IS NULL
  `,
  `
    ALTER TABLE orders
    ALTER COLUMN order_context_key SET NOT NULL
  `,
  `
    ALTER TABLE orders
    ALTER COLUMN order_context_label SET NOT NULL
  `,
  `
    ALTER TABLE orders
    ALTER COLUMN order_context_status SET NOT NULL
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_order_context_status_check'
      ) THEN
        ALTER TABLE orders
        ADD CONSTRAINT orders_order_context_status_check
        CHECK (order_context_status IN ('open', 'sent', 'closed'));
      END IF;
    END
    $$;
  `,
  `
    DROP INDEX IF EXISTS orders_one_draft_per_user_idx
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS orders_one_draft_per_user_idx
      ON orders (user_id, order_context_key)
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
