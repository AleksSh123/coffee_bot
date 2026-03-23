function normalizeCategoryId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function compareByName(left, right) {
  const leftSortIndex = Number(left.sortIndex);
  const rightSortIndex = Number(right.sortIndex);

  if (Number.isFinite(leftSortIndex) && Number.isFinite(rightSortIndex)) {
    return leftSortIndex - rightSortIndex;
  }

  return left.name.localeCompare(right.name, "ru-RU");
}

function buildRawNode(category, directItemCount) {
  const id = normalizeCategoryId(category?.id);

  if (!id || !category?.name) {
    return null;
  }

  const depthValue = Number(category.nest_depth);
  const sortIndexValue = Number(category.nest_left);

  return {
    id,
    name: category.name,
    parentId: normalizeCategoryId(category.parent_id),
    depth: Number.isFinite(depthValue) ? depthValue : 0,
    sortIndex: Number.isFinite(sortIndexValue) ? sortIndexValue : null,
    directItemCount,
    totalItemCount: 0,
    branchCategoryIds: [id],
    pathNames: [category.name],
    pathLabel: category.name,
    children: []
  };
}

function collectVisibleNode(node, parentPathNames = []) {
  const pathNames = [...parentPathNames, node.name];
  const visibleChildren = node.children
    .sort(compareByName)
    .map((child) => collectVisibleNode(child, pathNames))
    .filter(Boolean);
  const totalItemCount =
    node.directItemCount +
    visibleChildren.reduce((sum, child) => sum + child.totalItemCount, 0);

  if (totalItemCount <= 0) {
    return null;
  }

  return {
    ...node,
    totalItemCount,
    branchCategoryIds: [node.id, ...visibleChildren.flatMap((child) => child.branchCategoryIds)],
    pathNames,
    pathLabel: pathNames.join(" / "),
    children: visibleChildren
  };
}

function indexVisibleNodes(nodesById, node) {
  nodesById.set(node.id, node);

  for (const child of node.children) {
    indexVisibleNodes(nodesById, child);
  }
}

export function buildCategoryTree(categoriesById = new Map(), items = []) {
  const directItemCounts = new Map();

  for (const item of items) {
    const categoryId = normalizeCategoryId(item?.category_id);

    if (!categoryId) {
      continue;
    }

    directItemCounts.set(categoryId, (directItemCounts.get(categoryId) ?? 0) + 1);
  }

  const rawNodesById = new Map();

  for (const category of categoriesById.values()) {
    const categoryId = normalizeCategoryId(category?.id);
    const directItemCount = categoryId ? directItemCounts.get(categoryId) ?? 0 : 0;
    const rawNode = buildRawNode(category, directItemCount);

    if (rawNode) {
      rawNodesById.set(rawNode.id, rawNode);
    }
  }

  for (const node of rawNodesById.values()) {
    const parentNode = node.parentId ? rawNodesById.get(node.parentId) : null;

    if (parentNode) {
      parentNode.children.push(node);
    }
  }

  const visibleRoots = [...rawNodesById.values()]
    .filter((node) => !node.parentId || !rawNodesById.has(node.parentId))
    .sort(compareByName)
    .map((node) => collectVisibleNode(node))
    .filter(Boolean);
  const visibleNodesById = new Map();

  for (const rootNode of visibleRoots) {
    indexVisibleNodes(visibleNodesById, rootNode);
  }

  return {
    roots: visibleRoots,
    nodesById: visibleNodesById
  };
}
