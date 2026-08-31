/**
 * The operator's own details, as the legal pages state them.
 *
 * In one place because the imprint and the privacy policy have to agree on
 * them, and because they are the only part of those pages that is not text:
 * an address that differs between the two is a defect a reader will find
 * before anyone else does.
 */
export const LEGAL = {
    /** The natural or legal person running the service */
    operator: "Niklas Pfister",
    /** Street and number */
    street: "Sparkassenplatz 11",
    /** Postcode and town */
    city: "85276 Pfaffenhofen a. d. Ilm",
    /** The address readers and authorities reach the operator at */
    email: "legal@planarium.app",
    /** How long the webserver's logs are kept, in days */
    logDays: 14,
    /** How long a write-protected snapshot of the database is kept, in days */
    backupDays: 90,
    /** How long a registration link stays valid, in days */
    registrationDays: 7,
    /** The day the legal pages were last changed, as `YYYY-MM-DD` */
    updated: "2026-08-30",
};
