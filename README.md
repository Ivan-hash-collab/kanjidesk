# KanjiDesk

Пропись кандзи на Windows: списки, тесты, словарь и мнемоники (Gemini). Окно — Chrome/Edge в режиме приложения.

## Друзьям: как поставить

1. Установи [Python 3.12+](https://www.python.org/downloads/) (галочка **Add python.exe to PATH**) и [Google Chrome](https://www.google.com/chrome/) или Edge.
2. Скачай ZIP с [Releases](https://github.com/SenkuraDeveloper/kanjidesk/releases) **или** клонируй репозиторий.
3. Если это исходники без папки `dist`: поставь [Node.js](https://nodejs.org/) и в папке проекта выполни `npm install` и `npm run build`.
4. В папке `agent` скопируй `gemini_api_key.env.example` → `gemini_api_key.env` и вставь ключ с [Google AI Studio](https://aistudio.google.com/apikey). Без ключа учёба и словарь работают, истории Gemini — нет.
5. Один раз: `pip install -r agent/requirements.txt`
6. Запуск: двойной клик по **`start.bat`**. Чёрное окно не закрывай, пока пользуешься программой.
7. Ярлык на рабочий стол: `install-shortcut.ps1` (правый клик → Run with PowerShell).

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

Ключ Gemini: **`agent/gemini_api_key.env`** — никому не отправляй и не клади в git.

### Логи

`logs/kanjymemo.log` рядом с программой.

## Разработка

```bat
npm install
npm run build
start.bat
```

Агент ищется в таком порядке: переменная `KANJYMEMO_ROOT`, папка `agent/` в проекте, затем локальный путь разработчика.
