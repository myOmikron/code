# home

The household's home automation: Members switch lights and heating per Room, keep shared Lists and get Reminders, from their phones, the Dashboard or by voice. Login and Enrollment are the Identity context's (see `libs/galvyn-identity/GLOSSARY.md`).

## Language

### People

**Household**:
The one home and the people living in it. There is exactly one.
_Avoid_: home (as an entity), family, tenant

**Member**:
A person of the Household with an Account. All Members can do the same things; one of them is also the admin who issues Registration links.
_Avoid_: user, resident, guest

### Rooms and devices

**Room**:
A part of the home that Devices belong to and that Scenes and Automations are set up for.
_Avoid_: zone, area

**Device**:
A Zigbee light, thermostat, temperature and humidity sensor or motion sensor, placed in one Room.
_Avoid_: thing, entity, node

**Scene**:
A saved state for one Room's lights and target temperature that a Member applies in one go. Besides Scenes there is only the built-in "all off" for the whole home.
_Avoid_: preset, mood

**Automation**:
One of three fixed building blocks that act without a Member: a Room's heating schedule, a Room's motion light, a Scene applied at set times.
_Avoid_: rule, routine, script

### Lists and reminders

**List**:
A named, shared list of Items, for shopping as well as to-dos. Every List belongs to the whole Household.
_Avoid_: shopping list, todo list (as separate concepts)

**Item**:
One entry on a List that a Member checks off. Carries no due date and no assignee.
_Avoid_: task, todo, entry

**Reminder**:
A recurring notice to one or more Members that repeats until it is acknowledged.
_Avoid_: alarm, notification, task

### Channels

**Dashboard**:
The always-on wall display of the home, showing Rooms, Lists and Reminders and taking voice commands. A device, not a Member.
_Avoid_: kiosk, panel, screen

**Satellite**:
A device in a Room that listens for the wake word and speaks the replies of the voice assistant.
_Avoid_: speaker, voice device, endpoint
