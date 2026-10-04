import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/log";
import {
  checkRateLimit,
  clientKey,
  type RateLimitRule,
} from "@/lib/rate-limit";

/**
 * Domyślny limit dla całego API. Panel pracuje na Server Actions, więc te
 * liczby dotyczą głównie integracji i ruchu automatycznego — zwykły użytkownik
 * ich nie dotknie.
 */
export const DEFAULT_API_RULE: RateLimitRule = { limit: 120, windowMs: 60_000 };

/** Logowanie osobno i ostrzej: to jedyne wejście bez sesji. */
export const LOGIN_RULE: RateLimitRule = { limit: 10, windowMs: 60_000 };

/**
 * Wspólna obsługa błędów dla route handlerów. Każdy endpoint sam woła
 * `requireActor()` i serwis — autoryzacja nie jest zależna od UI.
 */
export async function apiHandler<T>(
  run: () => Promise<T>,
  successStatus = 200
): Promise<NextResponse> {
  try {
    const data = await run();
    return NextResponse.json({ data }, { status: successStatus });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Nieprawidłowe dane.",
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 422 }
      );
    }
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    const id = logError("API", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: `Błąd serwera. (${id})` } },
      { status: 500 }
    );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Limit zapytań dla trasy API. Wołany na początku handlera; gdy limit jest
 * wyczerpany, zwraca gotową odpowiedź 429, którą trasa po prostu oddaje.
 */
export function rateLimitResponse(
  request: Request,
  scope: string,
  rule: RateLimitRule = DEFAULT_API_RULE
): NextResponse | null {
  const result = checkRateLimit(`${scope}:${clientKey(request.headers)}`, rule);
  if (result.ok) return null;

  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Zbyt wiele zapytań. Spróbuj za chwilę.",
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    }
  );
}
