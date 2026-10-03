import { bhd } from './money';
import type { CreditCardProduct, Property, Seller, Vehicle } from './types';

/**
 * Demo catalog for the prototype. Prices and stock are illustrative, not live inventory.
 * Real supply comes from NMC / TAC / TCL / TRESCO systems and partner portals.
 */

export const SELLERS = {
  nmc: { id: 'nmc', name: { en: 'National Motor Company', ar: 'الشركة الوطنية للسيارات' }, type: 'group' },
  tac: { id: 'tac', name: { en: 'Tasheelat Automotive', ar: 'تسهيلات للسيارات' }, type: 'group' },
  tresco: { id: 'tresco', name: { en: 'Tasheelat Real Estate (TRESCO)', ar: 'تسهيلات العقارية (تريسكو)' }, type: 'group' },
  partnerDealer: { id: 'demo-dealer', name: { en: 'Partner Dealer (demo)', ar: 'وكيل شريك (تجريبي)' }, type: 'partner' },
  partnerBroker: { id: 'demo-broker', name: { en: 'Partner Broker (demo)', ar: 'وسيط شريك (تجريبي)' }, type: 'partner' },
} satisfies Record<string, Seller>;

const c = (en: string, ar: string) => ({ en, ar });

export const VEHICLES: Vehicle[] = [
  { id: 'v-honda-city-2026', make: 'Honda', model: 'City', trim: 'EX', year: 2026, condition: 'new', mileageKm: 0, priceFils: bhd(7_450), bodyType: 'sedan', fuel: 'petrol', seats: 5, color: c('Lunar Silver', 'فضي'), seller: SELLERS.nmc, inspected: false, accentHue: 210 },
  { id: 'v-honda-crv-2026', make: 'Honda', model: 'CR-V', trim: 'Touring Hybrid', year: 2026, condition: 'new', mileageKm: 0, priceFils: bhd(14_900), bodyType: 'suv', fuel: 'hybrid', seats: 5, color: c('Platinum White', 'أبيض بلاتيني'), seller: SELLERS.nmc, inspected: false, accentHue: 160 },
  { id: 'v-cadillac-escalade-2026', make: 'Cadillac', model: 'Escalade', trim: 'Sport Platinum', year: 2026, condition: 'new', mileageKm: 0, priceFils: bhd(46_500), bodyType: 'suv', fuel: 'petrol', seats: 7, color: c('Black Raven', 'أسود'), seller: SELLERS.nmc, inspected: false, accentHue: 260 },
  { id: 'v-haval-h9-2026', make: 'HAVAL', model: 'H9', trim: 'Supreme', year: 2026, condition: 'new', mileageKm: 0, priceFils: bhd(13_200), bodyType: 'suv', fuel: 'petrol', seats: 7, color: c('Desert Gold', 'ذهبي صحراوي'), seller: SELLERS.nmc, inspected: false, accentHue: 35 },
  { id: 'v-haval-jolion-2026', make: 'HAVAL', model: 'Jolion', trim: 'Pro', year: 2026, condition: 'new', mileageKm: 0, priceFils: bhd(7_990), bodyType: 'suv', fuel: 'hybrid', seats: 5, color: c('Azure Blue', 'أزرق'), seller: SELLERS.nmc, inspected: false, accentHue: 200 },
  { id: 'v-honda-accord-2023', make: 'Honda', model: 'Accord', trim: 'Sport', year: 2023, condition: 'used', mileageKm: 41_000, priceFils: bhd(9_300), bodyType: 'sedan', fuel: 'petrol', seats: 5, color: c('Crystal Black', 'أسود كريستالي'), seller: SELLERS.tac, inspected: true, accentHue: 0 },
  { id: 'v-toyota-landcruiser-2022', make: 'Toyota', model: 'Land Cruiser', trim: 'GXR', year: 2022, condition: 'used', mileageKm: 58_000, priceFils: bhd(24_800), bodyType: 'suv', fuel: 'petrol', seats: 8, color: c('Pearl White', 'أبيض لؤلؤي'), seller: SELLERS.tac, inspected: true, accentHue: 45 },
  { id: 'v-nissan-patrol-2021', make: 'Nissan', model: 'Patrol', trim: 'LE', year: 2021, condition: 'used', mileageKm: 72_000, priceFils: bhd(19_500), bodyType: 'suv', fuel: 'petrol', seats: 8, color: c('Grey', 'رمادي'), seller: SELLERS.tac, inspected: true, accentHue: 220 },
  { id: 'v-hyundai-elantra-2024', make: 'Hyundai', model: 'Elantra', trim: 'Smart', year: 2024, condition: 'used', mileageKm: 18_500, priceFils: bhd(6_100), bodyType: 'sedan', fuel: 'petrol', seats: 5, color: c('Red', 'أحمر'), seller: SELLERS.partnerDealer, inspected: true, accentHue: 355 },
  { id: 'v-tesla-model3-2024', make: 'Tesla', model: 'Model 3', trim: 'Long Range', year: 2024, condition: 'used', mileageKm: 22_000, priceFils: bhd(15_400), bodyType: 'sedan', fuel: 'electric', seats: 5, color: c('Midnight Silver', 'فضي داكن'), seller: SELLERS.partnerDealer, inspected: true, accentHue: 190 },
  { id: 'v-ford-f150-2023', make: 'Ford', model: 'F-150', trim: 'Lariat', year: 2023, condition: 'used', mileageKm: 35_000, priceFils: bhd(17_900), bodyType: 'pickup', fuel: 'petrol', seats: 5, color: c('Blue', 'أزرق'), seller: SELLERS.partnerDealer, inspected: true, accentHue: 230 },
  { id: 'v-kia-picanto-2025', make: 'Kia', model: 'Picanto', trim: 'LX', year: 2025, condition: 'used', mileageKm: 9_000, priceFils: bhd(3_750), bodyType: 'hatchback', fuel: 'petrol', seats: 4, color: c('Yellow', 'أصفر'), seller: SELLERS.tac, inspected: true, accentHue: 50 },
];

export const PROPERTIES: Property[] = [
  { id: 'p-saar-villa-4br', title: c('4-bedroom villa with garden', 'فيلا 4 غرف نوم مع حديقة'), area: c('Saar', 'سار'), type: 'villa', purpose: 'sale', priceFils: bhd(235_000), bedrooms: 4, bathrooms: 5, sizeSqm: 420, seller: SELLERS.tresco, valued: true, accentHue: 140 },
  { id: 'p-amwaj-apt-2br', title: c('Sea-view 2-bedroom apartment', 'شقة غرفتين بإطلالة بحرية'), area: c('Amwaj Islands', 'جزر أمواج'), type: 'apartment', purpose: 'sale', priceFils: bhd(98_000), bedrooms: 2, bathrooms: 2, sizeSqm: 135, seller: SELLERS.partnerBroker, valued: true, accentHue: 195 },
  { id: 'p-riffa-townhouse-3br', title: c('3-bedroom townhouse', 'تاون هاوس 3 غرف نوم'), area: c('Riffa', 'الرفاع'), type: 'townhouse', purpose: 'sale', priceFils: bhd(145_000), bedrooms: 3, bathrooms: 3, sizeSqm: 260, seller: SELLERS.tresco, valued: true, accentHue: 30 },
  { id: 'p-seef-apt-1br', title: c('Furnished 1-bedroom apartment', 'شقة مفروشة غرفة واحدة'), area: c('Seef', 'السيف'), type: 'apartment', purpose: 'rent', priceFils: bhd(380), bedrooms: 1, bathrooms: 1, sizeSqm: 80, seller: SELLERS.tresco, valued: false, accentHue: 260 },
  { id: 'p-juffair-apt-3br', title: c('3-bedroom family apartment', 'شقة عائلية 3 غرف نوم'), area: c('Juffair', 'الجفير'), type: 'apartment', purpose: 'rent', priceFils: bhd(650), bedrooms: 3, bathrooms: 3, sizeSqm: 190, seller: SELLERS.partnerBroker, valued: false, accentHue: 10 },
  { id: 'p-hamala-land', title: c('Residential land plot', 'أرض سكنية'), area: c('Hamala', 'الهملة'), type: 'land', purpose: 'sale', priceFils: bhd(72_000), bedrooms: 0, bathrooms: 0, sizeSqm: 500, seller: SELLERS.tresco, valued: true, accentHue: 80 },
  { id: 'p-diyar-villa-5br', title: c('5-bedroom waterfront villa', 'فيلا 5 غرف نوم على الواجهة البحرية'), area: c('Diyar Al Muharraq', 'ديار المحرق'), type: 'villa', purpose: 'sale', priceFils: bhd(310_000), bedrooms: 5, bathrooms: 6, sizeSqm: 520, seller: SELLERS.partnerBroker, valued: true, accentHue: 180 },
  { id: 'p-sanabis-office', title: c('Grade-A office floor', 'طابق مكاتب فئة أ'), area: c('Sanabis', 'السنابس'), type: 'office', purpose: 'rent', priceFils: bhd(2_400), bedrooms: 0, bathrooms: 2, sizeSqm: 450, seller: SELLERS.tresco, valued: false, accentHue: 240 },
];

export const CARDS: CreditCardProduct[] = [
  { id: 'imtiaz-world-elite', name: c('IMTIAZ World Elite Mastercard', 'بطاقة امتياز ورلد إيليت ماستركارد'), tier: 'world-elite', network: 'mastercard', annualFeeFils: bhd(150), minSalaryFils: bhd(2_500), forHer: false, gradient: ['#1b1b1f', '#4a4a55'], highlights: [c('Airport lounge access', 'دخول صالات المطارات'), c('Highest rewards rate', 'أعلى معدل مكافآت'), c('Travel insurance', 'تأمين السفر')] },
  { id: 'imtiaz-world', name: c('IMTIAZ World Mastercard', 'بطاقة امتياز ورلد ماستركارد'), tier: 'world', network: 'mastercard', annualFeeFils: bhd(75), minSalaryFils: bhd(1_200), forHer: false, gradient: ['#0b3d63', '#1f78b4'], highlights: [c('Rewards on every purchase', 'مكافآت على كل عملية شراء'), c('IMTIAZ Offers', 'عروض امتياز')] },
  { id: 'imtiaz-for-her-world', name: c('IMTIAZ for Her World Mastercard', 'بطاقة امتياز لها ورلد ماستركارد'), tier: 'world', network: 'mastercard', annualFeeFils: bhd(75), minSalaryFils: bhd(1_000), forHer: true, gradient: ['#7a1f4d', '#d9668f'], highlights: [c('Exclusive offers for women', 'عروض حصرية للمرأة'), c('Shopping and wellness rewards', 'مكافآت التسوق والعافية')] },
  { id: 'imtiaz-platinum', name: c('IMTIAZ Platinum Mastercard', 'بطاقة امتياز بلاتينيوم ماستركارد'), tier: 'platinum', network: 'mastercard', annualFeeFils: bhd(35), minSalaryFils: bhd(500), forHer: false, gradient: ['#5d6066', '#a7abb3'], highlights: [c('Low annual fee', 'رسوم سنوية منخفضة'), c('Easy Payment Plans', 'خطط سداد ميسرة')] },
  { id: 'imtiaz-uefa', name: c('IMTIAZ UEFA Champions League Card', 'بطاقة امتياز دوري أبطال أوروبا'), tier: 'world', network: 'mastercard', annualFeeFils: bhd(50), minSalaryFils: bhd(700), forHer: false, gradient: ['#06143d', '#2b4fd6'], highlights: [c('UEFA experiences', 'تجارب دوري الأبطال'), c('Match-day offers', 'عروض أيام المباريات')] },
  { id: 'imtiaz-prepaid', name: c('IMTIAZ Platinum Prepaid Mastercard', 'بطاقة امتياز بلاتينيوم المدفوعة مسبقاً'), tier: 'prepaid', network: 'mastercard', annualFeeFils: 0, minSalaryFils: 0, forHer: false, gradient: ['#2f5d50', '#5fae94'], highlights: [c('No salary requirement', 'بدون شرط راتب'), c('Top up anytime', 'اشحن في أي وقت')] },
];

export function findVehicle(id: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.id === id);
}

export function findProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

export function findCard(id: string): CreditCardProduct | undefined {
  return CARDS.find((card) => card.id === id);
}
