import { catalogButtonConfigs } from "../config/constants.js";

export function getCatalogConfigByButton(buttonLabel) {
  return catalogButtonConfigs.find((config) => config.buttonLabel === buttonLabel) ?? null;
}

export function filterCatalogItems(items, config) {
  if (Array.isArray(config?.categoryIds) && config.categoryIds.length > 0) {
    const allowedCategoryIds = new Set(config.categoryIds.map((categoryId) => String(categoryId)));
    return items.filter((item) => allowedCategoryIds.has(String(item.category_id ?? "")));
  }

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
