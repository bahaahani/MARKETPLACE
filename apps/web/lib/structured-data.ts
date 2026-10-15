import { CARDS, type CreditCardProduct, type Property, type Vehicle } from '@sahel/domain';
import { t, type AppLocale } from '@sahel/i18n';
import { translator } from './i18n';
import { absoluteUrl, localePath } from './seo';

/**
 * schema.org JSON-LD builders for the public pages (render them with <JsonLd/>, which escapes the JSON).
 *
 * Catalog facts only: no customer, session, pre-approval or price-for-you data (the pages are public and cached).
 * Money is written as schema.org expects: a decimal string in BHD with 3 decimals.
 */
const CONTEXT = 'https://schema.org';

const bhd = (fils: number) => (fils / 1000).toFixed(3);

const org = (name: string) => ({ '@type': 'Organization', name });

/** Bahrain Commercial Facilities Company, the operator of Sahel. */
function bcfc() {
  return {
    '@type': 'Organization',
    '@id': `${absoluteUrl('/')}#organization`,
    name: 'Bahrain Commercial Facilities Company',
    alternateName: 'BCFC',
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icons/512'),
    areaServed: { '@type': 'Country', name: 'Bahrain' },
  };
}

/** Home page: Organization + WebSite (with the cars search as the site search action). */
export function homeLd(locale: AppLocale) {
  return [
    { '@context': CONTEXT, ...bcfc() },
    {
      '@context': CONTEXT,
      '@type': 'WebSite',
      '@id': `${absoluteUrl('/')}#website`,
      name: t(locale, 'appName'),
      url: absoluteUrl(localePath(locale)),
      description: t(locale, 'tagline'),
      inLanguage: locale,
      publisher: { '@id': `${absoluteUrl('/')}#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl(localePath(locale, '/cars'))}?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

export function carLd(v: Vehicle, locale: AppLocale) {
  const url = absoluteUrl(localePath(locale, `/cars/${v.id}`));
  const condition = v.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition';
  return {
    '@context': CONTEXT,
    '@type': 'Car',
    '@id': `${url}#car`,
    name: `${v.make} ${v.model} ${v.trim}`,
    url,
    brand: { '@type': 'Brand', name: v.make },
    model: v.model,
    vehicleModelDate: String(v.year),
    itemCondition: condition,
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: v.mileageKm, unitCode: 'KMT' },
    bodyType: v.bodyType,
    fuelType: v.fuel,
    seatingCapacity: v.seats,
    color: v.color[locale],
    offers: {
      '@type': 'Offer',
      url,
      price: bhd(v.priceFils),
      priceCurrency: 'BHD',
      availability: 'https://schema.org/InStock',
      itemCondition: condition,
      seller: org(v.seller.name[locale]),
    },
  };
}

const RESIDENCE_TYPE: Record<Property['type'], string> = {
  villa: 'SingleFamilyResidence',
  apartment: 'Apartment',
  townhouse: 'House',
  land: 'Place',
  office: 'Place',
};

/** A property for sale or rent: a RealEstateListing whose main entity is the Offer for the place. */
export function propertyLd(p: Property, locale: AppLocale) {
  const url = absoluteUrl(localePath(locale, `/property/${p.id}`));
  const rent = p.purpose === 'rent';
  const place: Record<string, unknown> = {
    '@type': RESIDENCE_TYPE[p.type],
    name: p.title[locale],
    address: { '@type': 'PostalAddress', addressLocality: p.area[locale], addressCountry: 'BH' },
    floorSize: { '@type': 'QuantitativeValue', value: p.sizeSqm, unitCode: 'MTK' },
  };
  if (p.bedrooms > 0) place.numberOfBedrooms = p.bedrooms;
  if (p.bathrooms > 0) place.numberOfBathroomsTotal = p.bathrooms;
  return {
    '@context': CONTEXT,
    '@type': 'RealEstateListing',
    '@id': `${url}#listing`,
    name: p.title[locale],
    url,
    inLanguage: locale,
    mainEntity: {
      '@type': 'Offer',
      url,
      businessFunction: rent ? 'https://purl.org/goodrelations/v1#LeaseOut' : 'https://purl.org/goodrelations/v1#Sell',
      price: bhd(p.priceFils),
      priceCurrency: 'BHD',
      ...(rent ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: bhd(p.priceFils), priceCurrency: 'BHD', unitCode: 'MON' } } : {}),
      availability: 'https://schema.org/InStock',
      seller: org(p.seller.name[locale]),
      itemOffered: place,
    },
  };
}

function cardLd(c: CreditCardProduct, locale: AppLocale) {
  const tr = translator(locale);
  return {
    '@type': c.tier === 'prepaid' ? 'FinancialProduct' : 'CreditCard',
    name: c.name[locale],
    url: absoluteUrl(localePath(locale, '/cards')),
    description: c.highlights.map((h) => h[locale]).join(', '),
    provider: bcfc(),
    feesAndCommissionsSpecification: `${tr.t('annualFee')}: ${c.annualFeeFils === 0 ? tr.t('free') : tr.money(c.annualFeeFils, 0)}`,
  };
}

/** The card catalogue as an ItemList of CreditCard (prepaid: FinancialProduct). Eligibility is personal and left out. */
export function cardsLd(locale: AppLocale) {
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    name: t(locale, 'cardsTitle'),
    itemListElement: CARDS.map((c, i) => ({ '@type': 'ListItem', position: i + 1, item: cardLd(c, locale) })),
  };
}
