import { privateMetadata } from '@/lib/seo';

// Private area (customer, dealer or checkout): not indexed. Also X-Robots-Tag in next.config.ts and disallowed in robots.ts.
export const metadata = privateMetadata;

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
