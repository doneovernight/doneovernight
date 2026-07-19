function customerError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeCustomerEmail(value) {
  return clean(value).toLowerCase();
}

function normalizeCustomerCompany(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeCustomerInput(input = {}, booking = {}, existing = {}) {
  const name = clean(input.name || input.customer_name || input.customerName || existing.name || booking.name);
  const company = clean(input.company || input.customer_company || input.customerCompany || existing.company || booking.brandCompany);
  const email = normalizeCustomerEmail(input.email || input.customer_email || input.customerEmail || existing.email || booking.email);
  const phone = clean(input.phone || input.customer_phone || input.customerPhone || existing.phone || booking.phone);
  const billingAddress = clean(input.billing_address || input.billingAddress || input.customer_address || input.customerAddress || existing.billing_address || booking.billingAddress);
  const vatNumber = clean(input.vat_number || input.vatNumber || input.customer_vat_number || input.customerVatNumber || existing.vat_number || booking.vatNumber);
  const instagram = clean(input.instagram || existing.instagram || booking.instagram);
  const notes = clean(input.notes ?? existing.notes ?? "");
  if (!name) throw customerError("Customer name is required", "CUSTOMER_NAME_REQUIRED");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw customerError("A valid customer email is required", "CUSTOMER_EMAIL_INVALID");
  }
  const normalizedCompany = normalizeCustomerCompany(company);
  if (!email && !normalizedCompany) {
    throw customerError("Customer email or company is required", "CUSTOMER_IDENTITY_REQUIRED");
  }
  return {
    name,
    company,
    email: email || null,
    normalized_email: email,
    normalized_company: normalizedCompany,
    phone,
    billing_address: billingAddress,
    vat_number: vatNumber,
    instagram,
    notes,
    booking_context: booking && Object.keys(booking).length ? {
      booking_task_id: clean(booking.taskId || booking.task_id || booking.id),
      project_type: clean(booking.projectType),
      location: clean(booking.location),
      preferred_date: clean(booking.preferredDate),
      budget: clean(booking.budget),
      captured_at: new Date().toISOString()
    } : (existing.booking_context || {})
  };
}

function duplicateCustomer(customers = [], candidate = {}) {
  return customers.find((customer) => (
    candidate.normalized_email && customer.normalized_email === candidate.normalized_email
  ) || (
    candidate.normalized_company && customer.normalized_company === candidate.normalized_company
  )) || null;
}

module.exports = {
  duplicateCustomer,
  normalizeCustomerCompany,
  normalizeCustomerEmail,
  normalizeCustomerInput
};

