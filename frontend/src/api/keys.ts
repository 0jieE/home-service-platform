/** Centralized TanStack Query keys. Booking keys follow the contract's realtime rules: ["bookings"], ["booking", id]. */
export const qk = {
  config: ['config'] as const,
  coverage: ['coverage'] as const,
  me: ['me'] as const,
  customerMe: ['customer', 'me'] as const,
  categories: (includeInactive = false) => ['categories', { includeInactive }] as const,
  technicians: (params: object) => ['technicians', params] as const,
  technician: (id: number) => ['technician', id] as const,
  technicianAvailability: (id: number, from?: string, to?: string) =>
    ['technician', id, 'availability', { from, to }] as const,
  technicianReviews: (id: number, page: number) => ['technician', id, 'reviews', page] as const,
  techMe: ['technician', 'me'] as const,
  techMyAvailability: (from?: string, to?: string) =>
    ['technician', 'me', 'availability', { from, to }] as const,
  recommendations: (params: object) => ['recommendations', params] as const,
  bookings: (params?: object) => (params ? (['bookings', params] as const) : (['bookings'] as const)),
  booking: (id: number) => ['booking', id] as const,
  admin: {
    all: ['admin'] as const,
    stats: ['admin', 'stats'] as const,
    applications: (params: object) => ['admin', 'applications', params] as const,
    application: (id: number) => ['admin', 'application', id] as const,
    users: (params: object) => ['admin', 'users', params] as const,
    disputes: (params: object) => ['admin', 'disputes', params] as const,
    recSettings: ['admin', 'recommendation-settings'] as const,
    coverage: ['admin', 'coverage'] as const,
  },
};
