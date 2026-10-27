import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

i18n.use(initReactI18next).init({
    lng: "en",
    resources: {},
    interpolation: { escapeValue: false },
});

afterEach(() => cleanup());
