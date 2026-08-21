// Lives in components/ and not in app/page.tsx because an App Router page file
// may only export `default` and a fixed set of framework names — exporting a
// component from a page is a build error, not a lint warning.
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-micro font-semibold uppercase tracking-[0.1em] text-faint">
      {children}
    </h2>
  );
}
