import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

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
    console.error("Błąd API:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Błąd serwera." } },
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
