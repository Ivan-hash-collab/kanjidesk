from __future__ import annotations

# Student-facing groups. Internal tools (catalog-lookup, parse-list, batch, chat, briefing)
# are not shown as session checkboxes.

GROUPS: list[dict] = [
    {
        "id": "remember",
        "title": "Как запомнить",
        "hint": "смысл знака и его чтения — разными приёмами",
        "skills": [
            {
                "id": "mnemonic",
                "label": "История на значение",
                "hint": "картинка из формы знака → смысл. Не про чтения.",
            },
            {
                "id": "readings",
                "label": "Чтения",
                "hint": "он / кун и отдельный крючок, чтобы запомнить звук",
            },
        ],
    },
    {
        "id": "shape",
        "title": "Как выглядит",
        "hint": "из каких черт собран и с какими знаками его путают глазами",
        "skills": [
            {
                "id": "decompose",
                "label": "Части знака",
                "hint": "разбор по форме (IDS), без выдуманных радикалов",
            },
            {
                "id": "lookalikes",
                "label": "Не перепутать",
                "hint": "похожие по написанию, не по смыслу. Всегда: чем отличается.",
            },
        ],
    },
    {
        "id": "use",
        "title": "По желанию",
        "hint": "можно выключить — для запоминания знака не обязательно",
        "skills": [
            {
                "id": "vocab",
                "label": "Слова",
                "hint": "2–4 слова, где этот знак живёт",
            },
            {
                "id": "etymology",
                "label": "Откуда знак",
                "hint": "пиктограф, сложение или фонетик — по справочнику",
            },
        ],
    },
]


def groups_public() -> list[dict]:
    return GROUPS
