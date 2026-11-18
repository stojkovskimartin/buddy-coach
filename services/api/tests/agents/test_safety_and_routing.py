from __future__ import annotations

import pytest

from buddy_coach.coach.contracts import AgentName
from buddy_coach.coach.routing import IntentRouter
from buddy_coach.coach.safety import SafetyCategory, SafetyGuard

guard = SafetyGuard()


@pytest.mark.parametrize(
    ("message", "category"),
    [
        ("I had chest pain during my interval run", SafetyCategory.EMERGENCY),
        ("Ich hatte Brustschmerzen beim Laufen", SafetyCategory.EMERGENCY),
        ("I fainted after the race", SafetyCategory.EMERGENCY),
        ("I want to kill myself", SafetyCategory.MENTAL_HEALTH),
        ("I make myself throw up after dinner", SafetyCategory.EATING_DISORDER),
        ("should I just stop eating to make weight?", SafetyCategory.EATING_DISORDER),
        ("sharp pain in my knee when running downhill", SafetyCategory.INJURY),
        ("my ankle is swollen", SafetyCategory.INJURY),
        ("I want to starve myself before the weigh-in", SafetyCategory.EATING_DISORDER),
        ("Ich will gar nichts mehr essen", SafetyCategory.EATING_DISORDER),
    ],
)
def test_red_flags_are_escalated(message: str, category: SafetyCategory) -> None:
    verdict = guard.check_input(message)
    assert verdict.category is category
    assert not verdict.allowed
    assert verdict.message


@pytest.mark.parametrize(
    "message",
    [
        "How much protein should I eat?",
        "Plan my long run for Sunday",
        "My legs are a bit tired after yesterday",
        "I want to run faster than last year",
    ],
)
def test_normal_messages_pass(message: str) -> None:
    assert guard.check_input(message).allowed


@pytest.mark.parametrize(
    "message",
    [
        "I want to stop eating junk food",
        "I'm starving after my long run",
        "Is a restaurant meal ok before the race?",
        "Ich will kein Junkfood mehr essen",
    ],
)
def test_common_phrases_are_not_false_alarms(message: str) -> None:
    assert guard.check_input(message).allowed


def test_mental_health_wins_over_other_categories() -> None:
    verdict = guard.check_input("chest pain and I want to end my life")
    assert verdict.category is SafetyCategory.MENTAL_HEALTH


@pytest.mark.parametrize(
    "text",
    [
        "You probably have diabetes, so cut sugar.",
        "Aim for 800 kcal per day this week.",
        "Iss 900 Kalorien pro Tag.",
        "Just eat 800 kcal.",
        "Limit yourself to 1000 cal in total.",
        "Du hast wahrscheinlich eine Essstörung.",
        "Train through the pain, it will pass.",
        "Try fasting for 3 days.",
    ],
)
def test_unsafe_outputs_are_blocked(text: str) -> None:
    assert guard.check_output(text).category is SafetyCategory.UNSAFE_OUTPUT


@pytest.mark.parametrize(
    "text",
    [
        "A 300 kcal snack before the run works well.",
        "Your target is 2450 kcal per day.",
        "You have a great base for the marathon.",
        "Take a 200 kcal gel every 45 minutes during the ride.",
        "A 400 kcal shake after training helps recovery.",
    ],
)
def test_safe_outputs_pass(text: str) -> None:
    assert guard.check_output(text).allowed


router = IntentRouter()


@pytest.mark.parametrize(
    ("message", "agent"),
    [
        ("How many calories should I eat today?", AgentName.NUTRITION),
        ("What should I eat before a long ride? any gel?", AgentName.NUTRITION),
        ("Plan my intervals for the marathon", AgentName.TRAINING),
        ("I slept badly and feel tired and sore", AgentName.RECOVERY),
        ("How is my progress this month?", AgentName.PROGRESS),
        ("I have no motivation, I want to give up", AgentName.MOTIVATION),
        ("Hello coach!", AgentName.HEAD_COACH),
        ("Wie viele Kalorien soll ich essen?", AgentName.NUTRITION),
    ],
)
def test_routing(message: str, agent: AgentName) -> None:
    assert router.route(message) is agent


@pytest.mark.parametrize(
    ("message", "agent"),
    [
        ("Which restaurant should I pick?", AgentName.HEAD_COACH),  # not "rest"
        ("I feel fatigue in my legs", AgentName.RECOVERY),  # not "fat"
        ("I ran 10 km yesterday", AgentName.TRAINING),
        ("Ich gehe morgen joggen", AgentName.TRAINING),
        ("I'm running too slowly", AgentName.TRAINING),
    ],
)
def test_routing_word_boundaries(message: str, agent: AgentName) -> None:
    assert router.route(message) is agent


def test_german_escalation_message() -> None:
    verdict = guard.check_input("Ich habe Brustschmerzen", language="de")
    assert verdict.message is not None
    assert "Notruf" in verdict.message


def test_tie_goes_to_head_coach() -> None:
    assert router.route("food and sleep") is AgentName.HEAD_COACH
