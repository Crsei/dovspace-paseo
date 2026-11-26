import { defineTranslations } from "@getpaseo/plugin/client";
import en from "./locales/en.json" with { type: "json" };
import zhCN from "./locales/zh-CN.json" with { type: "json" };

export const messages = defineTranslations({ resources: { en, "zh-CN": zhCN } });
