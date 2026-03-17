export const defaultCatalogTitle = "Tasty Coffee";
export const promotionsGroupCommand = "/акции";

export const priceButtonLabel = "Прайс";
export const promotionsButtonLabel = "Акции";
export const sortOfWeekButtonLabel = "Сорт недели";
export const sortOfMonthButtonLabel = "Сорт месяца";
export const microlotOfWeekButtonLabel = "Микролот недели";

export const catalogButtonConfigs = [
  {
    buttonLabel: priceButtonLabel,
    headerTitle: defaultCatalogTitle,
    emptyMessage: "Каталог пока пуст."
  },
  {
    buttonLabel: promotionsButtonLabel,
    headerTitle: promotionsButtonLabel,
    groupByPromotionType: true,
    labelNames: [
      microlotOfWeekButtonLabel,
      sortOfWeekButtonLabel,
      sortOfMonthButtonLabel
    ],
    emptyMessage: "Сейчас в каталоге нет акционных позиций."
  },
  {
    buttonLabel: sortOfWeekButtonLabel,
    headerTitle: sortOfWeekButtonLabel,
    labelName: sortOfWeekButtonLabel,
    emptyMessage: "Сейчас в каталоге нет позиций с меткой «Сорт недели»."
  },
  {
    buttonLabel: sortOfMonthButtonLabel,
    headerTitle: sortOfMonthButtonLabel,
    labelName: sortOfMonthButtonLabel,
    emptyMessage: "Сейчас в каталоге нет позиций с меткой «Сорт месяца»."
  },
  {
    buttonLabel: microlotOfWeekButtonLabel,
    headerTitle: microlotOfWeekButtonLabel,
    labelName: microlotOfWeekButtonLabel,
    emptyMessage: "Сейчас в каталоге нет позиций с меткой «Микролот недели»."
  }
];

export const promptMessage =
  "Выберите кнопку: полный прайс или одну из тематических подборок.";

export const catalogUnavailableMessage =
  "Не удалось загрузить каталог. Попробуйте еще раз чуть позже.";
