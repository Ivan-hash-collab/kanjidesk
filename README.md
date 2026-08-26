# KanjiDesk

Пропись кандзи на Windows: списки, тесты, словарь и мнемоники (Gemini).

## Друзьям: один файл

1. Открой [Releases](https://github.com/Ivan-hash-collab/kanjidesk/releases) и скачай **KanjiDesk.exe**.
2. Запусти. Больше ничего ставить не нужно — ни Python, ни Node.js.
3. Закрой окно KanjiDesk, когда закончишь. Списки и прогресс живут в `%APPDATA%\KanjiDesk`.

## Тебе: отладка, не exe

Это **две разные программы**. Не путай ярлык на рабочем столе с файлом с GitHub.

| | Отладка (ты) | Релиз (другу) |
|---|---|---|
| Запуск | ярлык **KanjiDesk (отладка)** или `start.bat` | `KanjiDesk.exe` из Releases |
| Окно | заголовок «KanjiDesk · отладка», слева подпись «отладка» | просто «KanjiDesk» |
| Код | `%APPDATA%\Anki2\KanjiDesk` | внутри exe |
| Данные | `chrome-profile` и ключ рядом с `start.bat` | `%APPDATA%\KanjiDesk` |

После новой сборки exe отладка и релиз могут быть открыты вместе. Старый `KanjiDesk.exe` с GitHub ещё сидит на порту отладки: если он запущен, `start.bat` предупредит и не подсядет в его окно.

Если окно не открылось — поставь [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2) (на Windows 10/11 обычно уже есть).

Мнемоники Gemini: в **Настройках** вставь ключ с [Google AI Studio](https://aistudio.google.com/apikey). Без ключа словарь и пропись работают как обычно.

## Где хранятся данные

Всё локально на компьютере. В облако ничего само не уходит, кроме запросов к Gemini, если включены мнемоники.

### Списки, настройки, статистика

Живут в **localStorage профиля окна**, не в обычном Chrome.

Папка: `chrome-profile/` рядом с `start.bat`.

| Что | Ключ |
|---|---|
| Свои списки кандзи | `kanjidesk.lists` |
| Настройки и режимы квиза | `kanjidesk.settings` |
| Статистика и календарь | `kanjidesk.stats` |
| Последний набор и история сессий | `kanjidesk.lastSession`, `kanjidesk.sessionHistory` |
| Заметки и мнемоники знаков | `kanjidesk.kanjiMeta` |
| Привязка сессии мнемоник | `kanjidesk.memoIds` |

Удалить папку `chrome-profile` = сбросить приложение к «как с нуля» (списки тоже пропадут).

### Прописи (чернила)

Кэш черт кандзи — **IndexedDB** `kanjidesk-strokes` внутри того же `chrome-profile`.

### Набор из Anki на сегодня

Файл **`session.json`** рядом с `launch.py`. Это разовый импорт «сегодняшних знаков», не библиотека списков. Списки хранятся в localStorage, как в таблице выше.

### Мнемоники (агент)

SQLite: `agent/data/user/kanjymemo.db`

Там сессии разбора, сгенерированные истории, кэш ответов модели, заметки знаков на стороне агента. Справочник курса — `agent/kanji db/japanese_kanji.db` (его не надо трогать).

Ключ Gemini вставляется в Настройках и пишется в **`gemini_api_key.env`** (`%APPDATA%\KanjiDesk` в exe, рядом с `agent/` при разработке). Никому не отправляй и не клади в git.

### Логи

`logs/kanjymemo.log` рядом с программой.

## Разработка

```bat
npm install
npm run build
start.bat
```

Агент ищется в таком порядке: переменная `KANJYMEMO_ROOT`, папка `agent/` в проекте, затем локальный путь разработчика.

Сборка одного `KanjiDesk.exe` для друга:

```bat
npm run build
python -m pip install -r packaging/requirements-build.txt
python packaging/build_exe.py
```

Файл появится в `dist-portable/KanjiDesk.exe`. На GitHub он собирается сам при теге `v*`.
