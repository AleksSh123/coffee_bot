import { createHash } from "node:crypto";

const defaultOrderContextLabel = "Прайс без срока действия";

function normalizeOrderContextLabel(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || defaultOrderContextLabel;
}

export function buildOrderContext(pricesValidText) {
  const label = normalizeOrderContextLabel(pricesValidText);

  return {
    key: createHash("sha1").update(label).digest("hex"),
    label
  };
}
