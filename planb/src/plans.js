// Progi pakietów. Cała aplikacja pyta wyłącznie features(konto) – nowy próg
// (np. kolejna licencja B2B) to nowy wpis tutaj, bez zmian w logice planu.
export const TIERS = {
  free: {
    label: 'Podstawowy (bezpłatny)',
    maxWards: 1, maxTasks: 3, maxContacts: 3,
    timedAccess: false, checkin: false, drills: true, qrCard: true, orgReporting: false,
  },
  family: {
    label: 'Rodzinny (płatny)',
    maxWards: 6, maxTasks: 30, maxContacts: 12,
    timedAccess: true, checkin: true, drills: true, qrCard: true, orgReporting: false,
  },
  b2b: {
    label: 'Organizacja / B2B (licencja)',
    maxWards: 10, maxTasks: 50, maxContacts: 20,
    timedAccess: true, checkin: true, drills: true, qrCard: true, orgReporting: true,
  },
}

export const features = acc => TIERS[acc.tier] || TIERS.free
