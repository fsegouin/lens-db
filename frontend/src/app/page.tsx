import Link from "next/link";

const sections = [
  {
    title: "Systems",
    description:
      "Browse 130+ camera systems organized by manufacturer and mount type.",
    href: "/systems",
    count: "130+",
  },
  {
    title: "Lenses",
    description:
      "Search and filter 7,400+ autofocus and manual focus interchangeable lenses.",
    href: "/lenses",
    count: "7,400+",
  },
  {
    title: "Cameras",
    description:
      "Explore camera bodies across SLR, mirrorless, rangefinder, and medium format.",
    href: "/cameras",
    count: "1,000+",
  },
  {
    title: "Collections",
    description:
      "Curated thematic lists: holy trinities, pancake lenses, ultra-fast primes, and more.",
    href: "/collections",
    count: "50+",
  },
];

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="space-y-4 pt-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-100">
          The Camera Lens Database
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Comprehensive database of camera lenses and bodies with
          specifications, compatibility information, and expert recommendations
          for every genre of photography.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link
            href="/lenses"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Browse Lenses
          </Link>
          <Link
            href="/search"
            className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Advanced Search
          </Link>
        </div>
      </section>

      {/* Section Cards */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-xl border border-zinc-200 p-6 transition-all hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {section.count}
            </div>
            <h2 className="mb-1 text-lg font-semibold text-zinc-800 group-hover:text-zinc-900 dark:text-zinc-200">
              {section.title}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {section.description}
            </p>
          </Link>
        ))}
      </section>

      {/* About */}
      <section className="mx-auto max-w-3xl space-y-4 text-center">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          About This Project
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          This is a recreation of the lens-db.com database, originally created
          by Evgenii Artemov in 2012. The original site contained data from
          8,400+ manufacturer booklets, catalogs, and datasheets. This project
          aims to preserve and continue that work as a community resource.
        </p>
      </section>
    </div>
  );
}
