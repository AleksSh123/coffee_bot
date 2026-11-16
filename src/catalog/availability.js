export function filterAvailableCatalogItems(items) {
  return items.flatMap((item) => {
    if (item.not_available === true) {
      return [];
    }

    const offers = (Array.isArray(item.offers) ? item.offers : []).filter(
      (offer) => offer.not_available !== true
    );

    return offers.length > 0 ? [{ ...item, offers }] : [];
  });
}
