const ERRORS: Record<string, string> = {
  signin_failed: "Sign-in failed. Please try again.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">GitHub Automation Bot</h1>
      <p className="max-w-md text-neutral-500">
        Connect a repository and the bot reacts to new issues, pull requests and pushes: it labels,
        comments and alerts Slack based on rules you configure.
      </p>
      {message && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {message}
        </p>
      )}
      {/* Full-page navigation (not fetch): the API redirects to GitHub. */}
      <a
        href="/api/auth/github/login"
        className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Sign in with GitHub
      </a>
    </main>
  );
}
