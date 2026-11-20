"""Macedonian Safety Guard: red flags in Cyrillic and Latin letters, and normal talk that passes."""

from __future__ import annotations

import unicodedata

import pytest

from buddy_coach.coach.safety import SafetyCategory, SafetyGuard, safety_language

guard = SafetyGuard()


@pytest.mark.parametrize(
    ("message", "category"),
    [
        # Mental health
        ("Размислувам за самоубиство", SafetyCategory.MENTAL_HEALTH),
        ("Мислам на самоповредување", SafetyCategory.MENTAL_HEALTH),
        ("Ќе се убијам ако не успеам", SafetyCategory.MENTAL_HEALTH),
        ("Не сакам повеќе да живеам", SafetyCategory.MENTAL_HEALTH),
        ("Не ми се живее веќе", SafetyCategory.MENTAL_HEALTH),
        ("Сакам да умрам", SafetyCategory.MENTAL_HEALTH),
        ("ne sakam poveke da zhiveam", SafetyCategory.MENTAL_HEALTH),
        ("kje se ubijam", SafetyCategory.MENTAL_HEALTH),
        ("razmisluvam za samoubistvo", SafetyCategory.MENTAL_HEALTH),
        ("Немам желба за живот", SafetyCategory.MENTAL_HEALTH),
        ("Сакам да исчезнам", SafetyCategory.MENTAL_HEALTH),
        ("Пак се сечам", SafetyCategory.MENTAL_HEALTH),
        # Emergency
        ("Имав болка во градите на интервалите", SafetyCategory.EMERGENCY),
        ("Ме болат градите после трчање", SafetyCategory.EMERGENCY),
        ("Чувствувам притисок во градите", SafetyCategory.EMERGENCY),
        ("Се онесвестив после трката", SafetyCategory.EMERGENCY),
        ("Се онесвестила на тренинг", SafetyCategory.EMERGENCY),
        ("Изгубив свест на финишот", SafetyCategory.EMERGENCY),
        ("Не можам да дишам", SafetyCategory.EMERGENCY),
        ("bolka vo gradite", SafetyCategory.EMERGENCY),
        ("ne mozam da disam", SafetyCategory.EMERGENCY),
        ("ne možam da dišam", SafetyCategory.EMERGENCY),
        ("se onesvestiv", SafetyCategory.EMERGENCY),
        ("nemozam da disam", SafetyCategory.EMERGENCY),
        ("Немам воздух, се гушам", SafetyCategory.EMERGENCY),
        ("Ми притиска градите", SafetyCategory.EMERGENCY),
        # Eating disorder
        ("Повраќам после секое јадење", SafetyCategory.EATING_DISORDER),
        ("Предизвикувам повраќање за да ослабам", SafetyCategory.EATING_DISORDER),
        ("Земам лаксативи пред мерење", SafetyCategory.EATING_DISORDER),
        ("Се изгладнувам пред натпреварот", SafetyCategory.EATING_DISORDER),
        ("Три дена не јадам", SafetyCategory.EATING_DISORDER),
        ("Не јадам ништо.", SafetyCategory.EATING_DISORDER),
        ("Нема да јадам воопшто", SafetyCategory.EATING_DISORDER),
        ("povrakjam po jadenje", SafetyCategory.EATING_DISORDER),
        ("Намерно повраќам", SafetyCategory.EATING_DISORDER),
        ("Се терам да повраќам", SafetyCategory.EATING_DISORDER),
        ("Не јадев три дена", SafetyCategory.EATING_DISORDER),
        ("Се гладувам за да ослабам", SafetyCategory.EATING_DISORDER),
        # Injury
        ("Остра болка во коленото", SafetyCategory.INJURY),
        ("Глуждот ми е отечен", SafetyCategory.INJURY),
        ("Отокот не се повлекува", SafetyCategory.INJURY),
        ("Коленото ми отекло", SafetyCategory.INJURY),
        ("Не можам да стапнам на ногата", SafetyCategory.INJURY),
        ("glezhdot mi e otecen", SafetyCategory.INJURY),
        ("ostra bolka vo kolenoto", SafetyCategory.INJURY),
        ("Ми отекна коленото", SafetyCategory.INJURY),
        ("otekna mi kolenoto", SafetyCategory.INJURY),
        ("nemozam da stapnam na nogata", SafetyCategory.INJURY),
    ],
)
def test_macedonian_red_flags_are_escalated_in_macedonian(
    message: str, category: SafetyCategory
) -> None:
    verdict = guard.check_input(message, language="en")
    assert verdict.category is category
    assert not verdict.allowed
    assert verdict.message is not None
    assert any("Ѐ" <= ch <= "ӿ" for ch in verdict.message)  # answered in Macedonian


@pytest.mark.parametrize(
    "message",
    [
        "Колку протеини треба да јадам?",
        "Испланирај ми долго трчање за недела",
        "Нозете ми се малку уморни по вчера",
        "Сакам да тренирам за да изградам мускули",
        "Тренингот ми ги гради мускулите",
        "Изгладнет сум по тренинг",
        "Не јадам воопшто месо",
        "Не јадам ништо после 20 часот",
        "Прескокнав појадок денес",
        "Постам 40 дена за Божиќ",
        "Се плашам дека ќе се повредам на трката",
        "Градот е убав за трчање",
        "Имав малку болка во мускулите",
        "kolku proteini treba da jadam",
    ],
)
def test_normal_macedonian_talk_passes(message: str) -> None:
    assert guard.check_input(message).allowed


def test_mental_health_wins_in_macedonian_too() -> None:
    verdict = guard.check_input("Имам болка во градите и не сакам повеќе да живеам")
    assert verdict.category is SafetyCategory.MENTAL_HEALTH


def test_decomposed_letters_are_matched() -> None:
    decomposed = unicodedata.normalize("NFD", "Ќе се убијам")
    assert decomposed != "Ќе се убијам"
    assert guard.check_input(decomposed).category is SafetyCategory.MENTAL_HEALTH


def test_emergency_reply_names_the_macedonian_numbers() -> None:
    verdict = guard.check_input("болка во градите")
    assert verdict.message is not None
    assert "112" in verdict.message
    assert "194" in verdict.message


@pytest.mark.parametrize(
    "text",
    [
        "Најверојатно имаш анемија.",
        "Можеби имаш хормонско нарушување.",
        "Можеби имаш тендинитис.",
        "Имаш само мала инфекција.",
        "Тренирај низ болка, ќе помине.",
        "Игнорирај ја болката и продолжи.",
        "Јади само 800 ккал на ден.",
        "Вкупно 900 калории дневно е доволно.",
        "Пости само со вода три дена.",
        "Прескокни ги сите оброци пред мерење.",
        "Земи витамин Д 10000 ИЕ дневно.",
        "Земи витамин Д 10000 и.е. дневно.",
        "Земи 600 мг кофеин пред трката.",
        "Земи две таблети кофеин од 300 мг.",
        "Кофеин 9 мг на кг пред трката.",
        "Земи таблета 100 мг железо секој ден.",
        "Пробај мелатонин 5 мг пред спиење.",
    ],
)
def test_unsafe_macedonian_outputs_are_blocked(text: str) -> None:
    verdict = guard.check_output(text, language="mk")
    assert verdict.category is SafetyCategory.UNSAFE_OUTPUT
    assert verdict.message is not None
    assert "лекар" in verdict.message


@pytest.mark.parametrize(
    "text",
    [
        "Дали имаш дијабетес? Ако имаш, провери со лекар.",
        "Имаш ли дијабетес?",
        "Ако имаш болест, оди на лекар.",
        "Не ја игнорирај болката: одмори се.",
        "Немој да тренираш низ болка.",
        "Не прескокнувај оброци пред тренинг.",
        "Постот за Велигден е во ред ако јадеш доволно протеини.",
        "Гел од 200 ккал пред трката е добар избор.",
        "Јади околу 2400 ккал на ден.",
        "Витамин Д 20 мкг дневно е во препорачаната граница.",
        "Кафе со 100 мг кофеин пред тренинг е во ред.",
        "Лешата дава 3 мг железо на 100 г.",
        "Не земај мелатонин без лекар.",
        "Тренирај на денот на трката само лесно.",
    ],
)
def test_safe_macedonian_outputs_pass(text: str) -> None:
    assert guard.check_output(text, language="mk").allowed


@pytest.mark.parametrize(
    ("locale", "text", "language"),
    [
        ("mk-MK", None, "mk"),
        ("mk", "How much protein?", "mk"),
        ("de-CH", "Колку протеини?", "mk"),
        ("en", "Колку протеини?", "mk"),
        ("en", "Сколько белка мне нужно?", "en"),  # Russian
        ("en", "Я в порядке", "en"),
        ("de-CH", "Wie viel Eiweiss?", "de"),
        (None, None, "en"),
    ],
)
def test_reply_language_follows_what_was_written(
    locale: str | None, text: str | None, language: str
) -> None:
    assert safety_language(locale, text) == language


def test_a_russian_red_flag_is_answered_in_english() -> None:
    verdict = guard.check_input("Я думаю о самоубийстве")
    assert verdict.category is SafetyCategory.MENTAL_HEALTH
    assert verdict.message is not None
    assert "143" in verdict.message
    assert not any("Ѐ" <= ch <= "ӿ" for ch in verdict.message)
