import { requirePage } from "@/lib/auth";
import { getMyTeacherProfile } from "@/lib/services/teachers";
import { countUnreadMessages } from "@/lib/services/messages";
import { countLessonsAwaitingNote } from "@/lib/services/lesson-notes";
import { AppShell, type NavItem } from "@/components/app-shell";

function buildNav(unread: number, awaitingNotes: number): NavItem[] {
  return [
    { href: "/nauczyciel", label: "Pulpit" },
    { href: "/nauczyciel/uczniowie", label: "Moi uczniowie" },
    { href: "/nauczyciel/grafik", label: "Grafik i dyspozycja" },
    { href: "/nauczyciel/kalendarz", label: "Kalendarz lekcji" },
    { href: "/nauczyciel/wyplaty", label: "Moje wypłaty" },
    {
      href: "/nauczyciel/notatki",
      label: "Notatki z lekcji",
      count: awaitingNotes,
      countLabel: "lekcji bez notatki",
    },
    { href: "#", label: "Baza wiedzy", soon: true },
    {
      href: "/nauczyciel/wiadomosci",
      label: "Wiadomości",
      dot: unread > 0,
      count: unread,
      countLabel: "nieprzeczytanych",
    },
    { href: "/nauczyciel/ustawienia", label: "Ustawienia" },
  ];
}

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requirePage("TEACHER");
  const [profile, unread, awaitingNotes] = await Promise.all([
    getMyTeacherProfile(actor),
    countUnreadMessages(actor),
    countLessonsAwaitingNote(actor),
  ]);

  return (
    <AppShell
      nav={buildNav(unread, awaitingNotes)}
      roleLabel="Panel nauczyciela"
      userLabel={`${profile.fullName} · ${actor.email}`}
    >
      {children}
    </AppShell>
  );
}
