export function getCatalogOfferKey(offer) {
  if (offer?.id !== undefined && offer?.id !== null && String(offer.id).trim()) {
    return `id:${String(offer.id).trim()}`;
  }

  const typePart = offer?.type ? String(offer.type).trim() : "";
  const weightPart =
    offer?.weight !== undefined && offer?.weight !== null ? String(offer.weight).trim() : "";
  const namePart = offer?.name ? String(offer.name).trim() : "";

  return `fallback:${typePart}|${weightPart}|${namePart}`;
}
