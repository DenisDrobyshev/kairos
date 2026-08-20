/**
 * Both languages are first-class. Russian is not a translation layer bolted
 * onto English -- the project was thought in Russian -- so neither dictionary is
 * allowed to be a machine rendering of the other.
 */

export type Lang = "ru" | "en";

export const LANGS: readonly Lang[] = ["ru", "en"] as const;

type Dict = Record<string, string>;

const ru: Dict = {
  "app.tagline": "Сколько у тебя осталось на самом деле",
  "app.lede":
    "Не «сколько лет», а куда они уже расписаны. Введи свой день — увидишь, во что он превращается на дистанции жизни.",

  "nav.you": "Ты",
  "nav.day": "Твой день",
  "nav.ledger": "Куда уходит",
  "nav.levers": "Рычаги",
  "nav.method": "Как это считается",

  "you.age": "Возраст",
  "you.sex": "Пол",
  "you.sex.male": "Мужской",
  "you.sex.female": "Женский",
  "you.region": "Где живёшь",
  "you.region.ru": "Россия",
  "you.region.us": "США",
  "you.region.de": "Германия",
  "you.region.world": "В среднем по миру",
  "you.retirement": "Планируешь перестать работать в",
  "you.workDays": "Рабочих дней в неделю",
  "you.vacation": "Дней отпуска в году",
  "you.years": "лет",
  "you.days": "дней",

  "horizon.title": "Твой горизонт",
  "horizon.basis": "Считать до",
  "horizon.basis.median": "Медианы — 50 на 50",
  "horizon.basis.mean": "Средней продолжительности",
  "horizon.basis.p10": "Раннего исхода — 10%",
  "horizon.basis.p90": "Позднего исхода — 90%",
  "horizon.median": "Половина твоего поколения не доживёт до",
  "horizon.range": "Восемь человек из десяти уйдут между",
  "horizon.and": "и",
  "horizon.remaining": "Осталось",
  "horizon.hours": "часов",
  "horizon.improvement": "Учитывать, что медицина не стоит на месте",
  "horizon.improvement.hint":
    "Таблицы ВОЗ замораживают сегодняшнюю смертность навсегда. За последние полвека она падала примерно на 1–2% в год. Здесь берётся осторожный 1%.",
  "horizon.period": "Без поправки цифры ниже примерно на",

  "weeks.title": "Жизнь в неделях",
  "weeks.lived": "Прожито",
  "weeks.left": "Осталось до медианы",
  "weeks.bonus": "Если повезёт",
  "weeks.caption":
    "Один квадрат — одна неделя. Строка — год. Тёмные уже потрачены.",

  "day.title": "Обычные сутки",
  "day.hint":
    "Ставь честно, а не как хотелось бы. Сравнивать будешь с собой, а не с кем-то.",
  "day.perDay": "ч/день",
  "day.perWorkday": "ч/рабочий день",
  "day.perWeek": "ч/неделю",
  "day.committed": "Расписано",
  "day.free": "Свободно",
  "day.overcommitted":
    "В сутках столько часов не помещается. Убавь где-нибудь — иначе считать нечего.",

  "group.given": "Данность",
  "group.obligation": "Обязательства",
  "group.upkeep": "Обслуживание себя",
  "group.chosen": "Выбор",

  "bucket.alive": "Жизнь",
  "bucket.neutral": "Плата",
  "bucket.leak": "Утечка",
  "bucket.unallocated": "Ничем не занято",
  "bucket.hint":
    "Вот это решаешь только ты. Один и тот же час — у кого-то жизнь, у кого-то утечка. Арифметика за тебя это не решит.",
  "bucket.alive.hint": "Считаешь прожитым",
  "bucket.neutral.hint": "Цена существования",
  "bucket.leak.hint": "Отдал бы обратно",

  "ledger.title": "Куда уходит остаток",
  "ledger.category": "Занятие",
  "ledger.total": "Всего часов",
  "ledger.share": "Доля",
  "ledger.bucket": "Как считаешь",
  "ledger.years": "лет",
  "ledger.untilRetirement": "до пенсии",

  "levers.title": "Что реально сдвинет цифру",
  "levers.hint":
    "Отсортировано по величине, а не по благородству. Структурные решения почти всегда бьют ежедневную дисциплину.",
  "levers.frees": "освободит",
  "levers.costs": "отнимет",
  "levers.habit": "привычка",
  "levers.structural": "структура",
  "levers.cutDaily": "Убрать {hours} ч в день: {category}",
  "levers.cutUnit": "Убрать {hours} ч: {category}",
  "levers.remote": "Работать из дома — дорога исчезает",
  "levers.fourDayWeek": "Четырёхдневная неделя",
  "levers.retireEarly": "Перестать работать на {years} лет раньше",
  "levers.vacation": "Ещё {days} дней отпуска в году",
  "levers.exchange": "Один час в день на всю оставшуюся жизнь — это",

  "method.title": "Откуда числа",
  "method.source":
    "Смертность взята из таблиц дожития ВОЗ за {year} год. Модель Гомперца–Мейкема подогнана к ним скриптом в репозитории; на всех взрослых возрастах она воспроизводит опубликованную ожидаемую продолжительность с ошибкой не более {error} года.",
  "method.units":
    "Всё считается в часах и переводится в другие единицы только для показа. Это не педантизм: обычная версия этой арифметики вычитает «часы в день» из величины, где дня уже нет, и ошибается на порядок.",
  "method.distribution":
    "Одного числа не существует. Есть распределение, и оно широкое: между ранним и поздним исходом у тебя примерно {span} лет разницы. Любой калькулятор, который называет тебе одну дату, врёт точностью.",
  "method.privacy":
    "Ничего никуда не отправляется. Расчёт идёт в браузере, настройки лежат в адресной строке и в памяти вкладки.",

  "share.copy": "Скопировать ссылку на свой расчёт",
  "share.copied": "Скопировано",
  "share.reset": "Сбросить",

  "unit.hours": "ч",
  "unit.years": "лет",
  "unit.days": "дней",
  "unit.wakingDays": "дней бодрствования",
};

const en: Dict = {
  "app.tagline": "How much you actually have left",
  "app.lede":
    "Not how many years, but where they are already committed. Enter your ordinary day and watch what it becomes at the scale of a life.",

  "nav.you": "You",
  "nav.day": "Your day",
  "nav.ledger": "Where it goes",
  "nav.levers": "Levers",
  "nav.method": "How this is computed",

  "you.age": "Age",
  "you.sex": "Sex",
  "you.sex.male": "Male",
  "you.sex.female": "Female",
  "you.region": "Where you live",
  "you.region.ru": "Russia",
  "you.region.us": "United States",
  "you.region.de": "Germany",
  "you.region.world": "World average",
  "you.retirement": "You expect to stop working at",
  "you.workDays": "Working days per week",
  "you.vacation": "Vacation days per year",
  "you.years": "years",
  "you.days": "days",

  "horizon.title": "Your horizon",
  "horizon.basis": "Budget against",
  "horizon.basis.median": "The median — a coin flip",
  "horizon.basis.mean": "Mean life expectancy",
  "horizon.basis.p10": "The early outcome — 10%",
  "horizon.basis.p90": "The late outcome — 90%",
  "horizon.median": "Half your cohort will not reach",
  "horizon.range": "Eight in ten will die between",
  "horizon.and": "and",
  "horizon.remaining": "Remaining",
  "horizon.hours": "hours",
  "horizon.improvement": "Account for medicine not standing still",
  "horizon.improvement.hint":
    "WHO tables freeze today's mortality forever. Over the past half-century it fell by roughly 1–2% a year. This uses a cautious 1%.",
  "horizon.period": "Without this correction the figures below drop by about",

  "weeks.title": "A life in weeks",
  "weeks.lived": "Spent",
  "weeks.left": "Left, to the median",
  "weeks.bonus": "If you are lucky",
  "weeks.caption": "One square is one week. One row is one year. The dark ones are gone.",

  "day.title": "An ordinary day",
  "day.hint":
    "Enter it honestly rather than aspirationally. The comparison is with yourself, not with anyone else.",
  "day.perDay": "h/day",
  "day.perWorkday": "h/working day",
  "day.perWeek": "h/week",
  "day.committed": "Committed",
  "day.free": "Free",
  "day.overcommitted":
    "That many hours do not fit in a day. Take some back or there is nothing to compute.",

  "group.given": "Given",
  "group.obligation": "Obligations",
  "group.upkeep": "Upkeep",
  "group.chosen": "Chosen",

  "bucket.alive": "Living",
  "bucket.neutral": "Cost",
  "bucket.leak": "Leak",
  "bucket.unallocated": "Committed to nothing",
  "bucket.hint":
    "This part is yours alone. The same hour is living for one person and leak for another, and the arithmetic cannot decide it for you.",
  "bucket.alive.hint": "You count it as lived",
  "bucket.neutral.hint": "The price of existing",
  "bucket.leak.hint": "You would take it back",

  "ledger.title": "Where the remainder goes",
  "ledger.category": "Activity",
  "ledger.total": "Total hours",
  "ledger.share": "Share",
  "ledger.bucket": "How you count it",
  "ledger.years": "years",
  "ledger.untilRetirement": "until retirement",

  "levers.title": "What actually moves the number",
  "levers.hint":
    "Ranked by magnitude, not by how virtuous they sound. Structural decisions almost always beat daily discipline.",
  "levers.frees": "frees",
  "levers.costs": "costs",
  "levers.habit": "habit",
  "levers.structural": "structural",
  "levers.cutDaily": "Cut {hours}h a day of {category}",
  "levers.cutUnit": "Cut {hours}h of {category}",
  "levers.remote": "Work from home — the commute disappears",
  "levers.fourDayWeek": "A four-day week",
  "levers.retireEarly": "Stop working {years} years earlier",
  "levers.vacation": "{days} more vacation days a year",
  "levers.exchange": "One hour a day, for the rest of your life, is worth",

  "method.title": "Where the numbers come from",
  "method.source":
    "Mortality comes from WHO life tables for {year}. A Gompertz–Makeham model is fitted to them by a script in this repository; across every adult age it reproduces published life expectancy to within {error} years.",
  "method.units":
    "Everything accumulates in hours and converts to other units only for display. This is not pedantry: the usual version of this arithmetic subtracts hours-per-day from a quantity that no longer contains a day, and lands an order of magnitude off.",
  "method.distribution":
    "There is no single number. There is a distribution, and it is wide: about {span} years separate your early and late outcomes. Any calculator that hands you one date is lying through precision.",
  "method.privacy":
    "Nothing is sent anywhere. The computation runs in your browser and your settings live in the address bar and this tab.",

  "share.copy": "Copy a link to your numbers",
  "share.copied": "Copied",
  "share.reset": "Reset",

  "unit.hours": "h",
  "unit.years": "years",
  "unit.days": "days",
  "unit.wakingDays": "waking days",
};

const DICTS: Record<Lang, Dict> = { ru, en };

export function t(
  lang: Lang,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const raw = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

/** Best-effort guess from the browser, defaulting to Russian. */
export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "ru";
  return navigator.languages?.some((l) => l.toLowerCase().startsWith("en"))
    ? "en"
    : "ru";
}
