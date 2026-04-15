// =============================================================================
// SC LABS — next-intl request config
// Reads the NEXT_LOCALE cookie on every request and loads the matching
// messages JSON. Runs on the server for every RSC render.
// =============================================================================

import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  pickLocaleFromAcceptLanguage,
  type Locale,
} from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const hdrs = await headers();
    locale = pickLocaleFromAcceptLanguage(hdrs.get("accept-language"));
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
