import { jsonLdString } from '@/lib/json-ld';

/** One schema.org JSON-LD block (an object, or an array of objects). Escaped by jsonLdString; catalog facts only. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
