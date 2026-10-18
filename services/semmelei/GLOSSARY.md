# semmelei

The Nachbarschaftshilfe's pre-order shop: customers order for a pickup day, the Nachbarschaftshilfe buys everything at the Bakery and its staff hand out the orders. Login and Enrollment are the Identity context's (see `libs/galvyn-identity/GLOSSARY.md`).

## Language

**Nachbarschaftshilfe**:
The neighbourhood-help association that runs the shop. It is what customers deal with: it takes the orders, speaks in News Posts and hands out the orders.
_Avoid_: bakery, shop owner

**Bakery**:
The supplier the Nachbarschaftshilfe buys at. Customers never deal with it directly.
_Avoid_: shop, Nachbarschaftshilfe

**Admin**:
A staff Account with the Admin Role. Runs the shop and can do everything Verkauf can.
_Avoid_: superuser, owner

**News Post**:
A piece of news the Nachbarschaftshilfe publishes for its customers: a title and a Markdown text, without photos and without a named author. Called "Beitrag" in the UI; all News Posts together are "Neuigkeiten".
_Avoid_: news (as a singular), announcement, article, Meldung

**Draft**:
A News Post that only Admins see. Every News Post starts as one; a Published News Post that is withdrawn becomes one again.
_Avoid_: unpublished, hidden

**Published**:
The state of a News Post that customers see. Carries the point in time it was published.
_Avoid_: live, public, active
