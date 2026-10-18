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

**Item**:
Something customers can pre-order, with a name and a price. Called "Artikel" in the UI.
_Avoid_: product, article

**Bakery Article Number**:
The number the Bakery gives an Item in its own range, under which the Nachbarschaftshilfe orders it there. Optional, since not every Item comes from the Bakery, and several Items may share one. Staff only; customers never see it. Called "Artikelnummer (Bäckerei)" in the UI.
_Avoid_: ID, item number, SKU

**Procurement**:
What the Nachbarschaftshilfe buys at the Bakery for one pickup day: all positions of that day's orders that were not cancelled, summed per Item. Final once the day is Dispatched. Called "Beschaffung" in the UI.
_Avoid_: bakery order, purchase order

**Deadline**:
The point in time a pickup day stops taking orders. Customers can neither place nor cancel orders afterwards; staff can still cancel them until the Dispatch. Called "Bestellschluss" in the UI.
_Avoid_: cutoff, order time, lock

**Review Window**:
The span between a pickup day's Deadline and its Dispatch, in which Admins look over the day's orders and cancel the ones that should not be bought. Called "Prüfzeit" in the UI.
_Avoid_: grace period, buffer

**Dispatch**:
Sending a pickup day's Procurement to the Bakery, at the end of the Review Window. Customers get their binding confirmation with it. Called "Bestellversand" in the UI.
_Avoid_: bakery order, export, submission
