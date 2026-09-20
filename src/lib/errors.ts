export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Wymagane logowanie.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Brak uprawnień do tego zasobu.") {
    super(message, 403, "FORBIDDEN");
  }
}

/**
 * Zwracany też wtedy, gdy rekord istnieje, ale nie należy do zalogowanego
 * nauczyciela — nie ujawniamy istnienia cudzych uczniów ani lekcji.
 */
export class NotFoundError extends AppError {
  constructor(message = "Nie znaleziono zasobu.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Nieprawidłowe dane.",
    readonly fields?: Record<string, string[]>
  ) {
    super(message, 422, "VALIDATION_ERROR");
  }
}
