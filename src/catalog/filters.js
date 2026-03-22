import { catalogButtonConfigs } from "../config/constants.js";

export function getCatalogConfigByButton(buttonLabel) {
  return catalogButtonConfigs.find((config) => config.buttonLabel === buttonLabel) ?? null;
}

export function filterCatalogItems(items, config) {
  if (config?.categoryId !== undefined && config?.categoryId !== null) {
    return items.filter((item) => item.category_id === config.categoryId);
  }

  if (!config?.labelName && !config?.labelNames) {
    return items;
  }

  if (config.labelName) {
    return items.filter((item) => item.label?.name === config.labelName);
  }

  const allowedLabels = new Set(config.labelNames);
  return items.filter((item) => allowedLabels.has(item.label?.name));
}
