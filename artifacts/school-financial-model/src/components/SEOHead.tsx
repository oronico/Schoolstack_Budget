import { Helmet } from "react-helmet-async";

const SITE_NAME = "SchoolStack Budget";
const BASE_URL = "https://budget.schoolstack.ai";
const DEFAULT_TITLE = "SchoolStack Budget - Your Mission Deserves a Financial Story";
const DEFAULT_DESCRIPTION =
  "Build lender-ready 5-year financial projections for your school in under an hour. Guided, professional, exportable. No finance degree required.";
const DEFAULT_IMAGE = `${BASE_URL}/images/og-image.png?v=5`;

interface SEOHeadProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  ogType?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = DEFAULT_IMAGE,
  noIndex = false,
  ogType = "website",
  jsonLd,
}: SEOHeadProps) {
  const fullTitle = title === "" ? DEFAULT_TITLE : title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const canonicalUrl = `${BASE_URL}${path}`;

  return (
    <>
      <Helmet>
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        {noIndex && <meta name="robots" content="noindex, nofollow" />}

        <meta property="og:type" content={ogType} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta property="og:site_name" content={SITE_NAME} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
      </Helmet>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd]),
          }}
        />
      )}
    </>
  );
}
