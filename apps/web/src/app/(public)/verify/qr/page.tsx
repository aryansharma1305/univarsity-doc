import Link from 'next/link';
export default function Page() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-page-title">Secure QR verification</h1>
      <p className="mt-5 text-body text-muted-foreground">
        Open the verification link from an issued document with your phone camera. The link opens
        the matching document check; verification runs only when you submit it.
      </p>
      <p className="mt-5 text-body text-muted-foreground">
        Check that the link uses your university’s official Docversity domain. You can also enter
        the printed document number.
      </p>
      <div className="mt-8 flex flex-wrap gap-5">
        <Link
          className="min-h-11 text-brand underline underline-offset-4"
          href="/verify/admission-letter"
        >
          Verify Admission Letter
        </Link>
        <Link
          className="min-h-11 text-brand underline underline-offset-4"
          href="/verify/certificate"
        >
          Verify Certificate
        </Link>
      </div>
    </section>
  );
}
