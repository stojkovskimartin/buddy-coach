import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { I18nProvider } from "../src/i18n";

/** Renders a component the way the app does: inside the language provider. */
export function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}
