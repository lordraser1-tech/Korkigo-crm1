import { z } from "zod";

const trimmed = z.string().trim();

/** Puste pole formularza traktujemy jak brak wartości, nie jak pusty string. */
const optionalText = (max = 200) =>
  z
    .union([trimmed.max(max), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(v.replace(",", ".").trim())))
  .refine((v) => Number.isFinite(v), { message: "Podaj kwotę liczbowo." })
  .refine((v) => v >= 0, { message: "Kwota nie może być ujemna." })
  .refine((v) => v <= 100000, { message: "Kwota jest zbyt duża." })
  .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(0)), {
    message: "Maksymalnie dwa miejsca po przecinku.",
  });

export const loginSchema = z.object({
  email: trimmed.toLowerCase().email("Podaj poprawny adres e-mail."),
  password: z.string().min(1, "Podaj hasło."),
});

export const studentStatusSchema = z.enum(["ACTIVE", "PAUSED", "ENDED"]);

export const studentCreateSchema = z.object({
  firstName: trimmed.min(1, "Imię jest wymagane.").max(80),
  lastName: trimmed.min(1, "Nazwisko jest wymagane.").max(80),
  contactEmail: optionalText(120).refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    { message: "Podaj poprawny adres e-mail ucznia." }
  ),
  contactPhone: optionalText(40),
  parentName: optionalText(120),
  parentPhone: optionalText(40),
  parentEmail: optionalText(120).refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    { message: "Podaj poprawny adres e-mail opiekuna." }
  ),
  languageLevel: optionalText(20),
  subject: optionalText(120),
  status: studentStatusSchema.default("ACTIVE"),
  // Poniższe pola może ustawić WYŁĄCZNIE admin — serwis odrzuci je dla nauczyciela.
  ratePerLesson: amountSchema.optional(),
  teacherId: optionalText(40),
});

export const studentUpdateSchema = studentCreateSchema.partial();

export const teacherCreateSchema = z.object({
  email: trimmed.toLowerCase().email("Podaj poprawny adres e-mail."),
  password: z.string().min(8, "Hasło musi mieć min. 8 znaków.").max(200),
  firstName: trimmed.min(1, "Imię jest wymagane.").max(80),
  lastName: trimmed.min(1, "Nazwisko jest wymagane.").max(80),
  phone: optionalText(40),
  level: optionalText(60),
  ratePerLesson: amountSchema,
});

export const teacherUpdateSchema = z.object({
  firstName: trimmed.min(1).max(80).optional(),
  lastName: trimmed.min(1).max(80).optional(),
  phone: optionalText(40).optional(),
  level: optionalText(60).optional(),
  ratePerLesson: amountSchema.optional(),
  active: z.boolean().optional(),
});

export const lessonStatusSchema = z.enum([
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

const wallClock = trimmed.regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
  "Podaj datę i godzinę lekcji."
);

export const lessonCreateSchema = z
  .object({
    studentId: trimmed.min(1, "Wybierz ucznia."),
    teacherId: optionalText(40),
    scheduledAt: wallClock,
    durationMinutes: z.coerce
      .number()
      .int("Czas trwania podaj w pełnych minutach.")
      .min(15, "Lekcja musi trwać min. 15 minut.")
      .max(480, "Lekcja nie może trwać dłużej niż 8 godzin.")
      .default(60),
    type: z.enum(["RECURRING", "ONE_OFF"]).default("ONE_OFF"),
    repeatWeeks: z.coerce.number().int().min(1).max(52).default(1),
  })
  .refine((v) => v.type === "RECURRING" || v.repeatWeeks === 1, {
    message: "Powtórzenia dotyczą tylko lekcji cyklicznych.",
    path: ["repeatWeeks"],
  });

export const lessonUpdateSchema = z.object({
  scheduledAt: wallClock.optional(),
  durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
  status: lessonStatusSchema.optional(),
});

export const availabilitySchema = z.object({
  teacherId: optionalText(40),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: trimmed.regex(/^\d{2}:\d{2}$/, "Godzina w formacie 16:00."),
  endTime: trimmed.regex(/^\d{2}:\d{2}$/, "Godzina w formacie 20:00."),
}).refine((v) => v.startTime < v.endTime, {
  message: "Godzina zakończenia musi być późniejsza niż rozpoczęcia.",
  path: ["endTime"],
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Podaj obecne hasło."),
    newPassword: z.string().min(8, "Nowe hasło musi mieć min. 8 znaków.").max(200),
    confirmPassword: z.string().min(1, "Powtórz nowe hasło."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Hasła nie są identyczne.",
    path: ["confirmPassword"],
  });
