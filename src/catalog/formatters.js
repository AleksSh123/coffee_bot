function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatWeight(weight) {
  const numericWeight = Number(weight);

  if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
    return null;
  }

  if (numericWeight >= 1000 && numericWeight % 1000 === 0) {
    return `${numericWeight / 1000} кг`;
  }

  return `${numericWeight} г`;
}

function formatOfferType(type) {
  const offerTypeLabels = {
    bean_coffee: "зерно",
    ground_coffee: "молотый"
  };

  if (!type) {
    return null;
  }

  return offerTypeLabels[type] ?? type.replaceAll("_", " ");
}

function formatOfferLabel(offer) {
  const parts = [];
  const weight = formatWeight(offer.weight);
  const type = formatOfferType(offer.type);

  if (weight) {
    parts.push(weight);
  }

  if (type) {
    parts.push(type);
  }

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return offer.name || "вариант";
}

function formatPrice(price) {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return "цена по запросу";
  }

  return `${numericPrice.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function getCategoryNameForItem(item, categoriesById) {
  return categoriesById.get(item.category_id)?.name ?? "Без категории";
}

function getOfferWeightForSort(offer) {
  const numericWeight = Number(offer?.weight);
  return Number.isFinite(numericWeight) && numericWeight > 0 ? numericWeight : -1;
}

function formatCatalogItemBlock(item) {
  const offers = Array.isArray(item.offers)
    ? [...item.offers].sort(
        (left, right) => getOfferWeightForSort(right) - getOfferWeightForSort(left)
      )
    : [];
  const lines = [escapeHtml(item.name)];

  if (offers.length === 0) {
    lines.push(`  - ${formatPrice(null)}`);
    return lines.join("\n");
  }

  for (const offer of offers) {
    lines.push(`  - ${escapeHtml(formatOfferLabel(offer))}: ${formatPrice(offer.price)}`);
  }

  return lines.join("\n");
}

function indentBlock(block, prefix = "\u00A0") {
  return block
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function isHeaderBlock(block) {
  const normalizedBlock = block.trimStart();
  return (
    normalizedBlock.startsWith("<b>") ||
    normalizedBlock.startsWith("<u>") ||
    normalizedBlock.startsWith("<i>")
  );
}

function splitLongBlock(block, maxLength) {
  if (block.length <= maxLength) {
    return [block];
  }

  const lines = block.split("\n");
  const [title, ...details] = lines;
  const parts = [];
  let current = title;

  for (const detail of details) {
    const nextValue = `${current}\n${detail}`;

    if (nextValue.length > maxLength && current) {
      parts.push(current);
      current = `${title} (прод.)\n${detail}`;
      continue;
    }

    current = nextValue;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function chunkBlocks(blocks, maxLength) {
  const chunks = [];
  let currentChunk = "";
  let lastBlockWasHeader = false;

  for (const block of blocks.flatMap((item) => splitLongBlock(item, maxLength))) {
    const separator = currentChunk ? (lastBlockWasHeader ? "\n" : "\n\n") : "";
    const nextChunk = currentChunk ? `${currentChunk}${separator}${block}` : block;

    if (nextChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = block;
      lastBlockWasHeader = isHeaderBlock(block);
      continue;
    }

    currentChunk = nextChunk;
    lastBlockWasHeader = isHeaderBlock(block);
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildCategoryBlocks(items, categoriesById = new Map()) {
  const categoryGroups = new Map();

  for (const item of items) {
    const categoryName = getCategoryNameForItem(item, categoriesById);

    if (!categoryGroups.has(categoryName)) {
      categoryGroups.set(categoryName, []);
    }

    categoryGroups.get(categoryName).push(item);
  }

  const sortedCategoryNames = [...categoryGroups.keys()].sort((left, right) =>
    left.localeCompare(right, "ru-RU")
  );
  const itemBlocks = [];

  for (const categoryName of sortedCategoryNames) {
    itemBlocks.push(`<b>Категория: ${escapeHtml(categoryName)}</b>`);

    const sortedItems = [...categoryGroups.get(categoryName)].sort((left, right) =>
      left.name.localeCompare(right.name, "ru-RU")
    );

    for (const item of sortedItems) {
      itemBlocks.push(formatCatalogItemBlock(item));
    }
  }

  return itemBlocks;
}

function buildMessagesWithTitle(itemBlocks, title, itemsCount) {
  const bodyChunks = chunkBlocks(itemBlocks, 3200);

  return bodyChunks.map((chunk, index) => {
    const headerLines = [
      escapeHtml(title),
      `Товаров: ${itemsCount}`
    ];

    if (bodyChunks.length > 1) {
      headerLines.push(`Часть ${index + 1}/${bodyChunks.length}`);
    }

    const header = headerLines.join("\n");

    return `${header}\n\n${chunk}`;
  });
}

export function buildCatalogMessagesWithTitle(items, title, categoriesById = new Map()) {
  return buildMessagesWithTitle(buildCategoryBlocks(items, categoriesById), title, items.length);
}

export function buildPromotionsMessagesWithTitle(
  items,
  title,
  categoriesById = new Map(),
  labelNames = []
) {
  const itemBlocks = [];

  for (const labelName of labelNames) {
    const labelItems = items.filter((item) => item.label?.name === labelName);

    if (labelItems.length === 0) {
      continue;
    }

    itemBlocks.push(`<b><i><u>⭐ Акция: ${escapeHtml(labelName)}</u></i></b>`);
    itemBlocks.push(...buildCategoryBlocks(labelItems, categoriesById).map((block) => indentBlock(block)));
  }

  return buildMessagesWithTitle(itemBlocks, title, items.length);
}
