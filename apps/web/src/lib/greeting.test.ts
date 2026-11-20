import { checkinSkippedToday, dayPart, GREETING, shortDay, skipCheckinToday } from "./greeting";

afterEach(() => window.localStorage.clear());

it.each([
  [0, "morning"],
  [11, "morning"],
  [12, "afternoon"],
  [17, "afternoon"],
  [18, "evening"],
  [23, "evening"],
])("at %i h it is %s", (hour, part) => {
  expect(dayPart(new Date(2026, 10, 20, hour, 30))).toBe(part);
});

it("greets by the part of the day", () => {
  expect(GREETING[dayPart(new Date(2026, 10, 20, 15))]).toBe("Good afternoon");
});

it("shows an ISO day as that day in every time zone", () => {
  expect(shortDay("2026-11-20")).toBe("Fri 20 Nov");
});

it("remembers 'Not now' for today only", () => {
  const today = new Date(2026, 10, 20, 9);
  const tomorrow = new Date(2026, 10, 21, 9);
  expect(checkinSkippedToday(today)).toBe(false);
  skipCheckinToday(true, today);
  expect(checkinSkippedToday(today)).toBe(true);
  expect(checkinSkippedToday(tomorrow)).toBe(false);
  skipCheckinToday(false, today);
  expect(checkinSkippedToday(today)).toBe(false);
});
