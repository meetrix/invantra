import type { Customer, PartySnapshot, Settings } from "./types.ts";

/*
 * The party details a document prints. Approval stores these on the document;
 * before that, the print view builds them from the live settings and customer.
 */

export function snapshotBusiness(settings: Settings): PartySnapshot {
  return {
    name: settings.businessName,
    contactPerson: "",
    email: settings.businessEmail,
    phone: settings.businessPhone,
    address: settings.businessAddress,
    country: "",
    taxId: settings.businessTaxId,
    website: settings.businessWebsite,
    logoDataUrl: settings.logoDataUrl,
  };
}

export function snapshotCustomer(customer: Customer): PartySnapshot {
  return {
    name: customer.name,
    contactPerson: customer.contactPerson,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    country: customer.country,
    taxId: customer.taxId,
    website: "",
    logoDataUrl: null,
  };
}
