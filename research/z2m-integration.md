# Zigbee2MQTT integration surface for the home service

Research for #120 (map #118). Question: how does a Rust service drive and observe
Zigbee2MQTT (Z2M), which broker sits in between, and which client library fits.

Versions checked (2026-10-19): Zigbee2MQTT 2.14.2, nats-server 2.15.1, rumqttc 0.25.1,
paho-mqtt 0.14.0. Source code was read on the `master`/`main` branches of
[Koenkk/zigbee2mqtt](https://github.com/Koenkk/zigbee2mqtt),
[Koenkk/zigbee-herdsman-converters](https://github.com/Koenkk/zigbee-herdsman-converters) and
[nats-io/nats-server](https://github.com/nats-io/nats-server).
Context7 MCP was not available in this session; crate facts come from crates.io and GitHub directly.

## 1. Topics and payloads

All topics sit under `base_topic` (default `zigbee2mqtt`). Payloads are JSON
(`advanced.output: json` is the default; `attribute` / `attribute_and_json` also exist).
Source: [MQTT config](https://www.zigbee2mqtt.io/guide/configuration/mqtt.html),
[MQTT topics and messages](https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html).

| Topic | Direction | Retained | Notes |
|---|---|---|---|
| `zigbee2mqtt/<friendly_name>` | Z2M -> us | only if device option `retain: true` (default false) | full state JSON, e.g. `{"state":"ON","brightness":215,"color_temp":325}` |
| `zigbee2mqtt/<friendly_name>/set` | us -> Z2M | no | JSON command; same topic works for a group name |
| `zigbee2mqtt/<friendly_name>/get` | us -> Z2M | no | `{"state":""}` asks the device to report that attribute |
| `zigbee2mqtt/<friendly_name>/availability` | Z2M -> us | yes, QoS 1 | `{"state":"online"}` / `{"state":"offline"}`, only when availability is enabled |
| `zigbee2mqtt/bridge/state` | Z2M -> us | yes, QoS 1 | `{"state":"online"}`; also the Last Will (`offline`) |
| `zigbee2mqtt/bridge/info` | Z2M -> us | yes | version, coordinator, config |
| `zigbee2mqtt/bridge/devices` | Z2M -> us | yes | array of all devices with `definition.exposes` |
| `zigbee2mqtt/bridge/groups` | Z2M -> us | yes | array of groups with `id`, `friendly_name`, `members`, `scenes` |
| `zigbee2mqtt/bridge/definitions` | Z2M -> us | yes | cluster definitions |
| `zigbee2mqtt/bridge/event` | Z2M -> us | no | `{"type":"device_joined"\|"device_interview"\|"device_leave"\|"device_announce","data":{...}}` |
| `zigbee2mqtt/bridge/request/<cmd>` | us -> Z2M | no | `device/rename`, `device/options`, `device/bind`, `group/add`, `group/members/add`, `permit_join`, ... |
| `zigbee2mqtt/bridge/response/<cmd>` | Z2M -> us | no | `{"status":"ok"\|"error","data":...,"error":...,"transaction":...}`; send a `transaction` field to correlate |

Retain and QoS flags are taken from the Z2M source, not the docs:
availability publishes with `{retain: true, qos: 1}`
([availability.ts](https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/extension/availability.ts)),
`bridge/info|devices|groups|definitions` with `{retain: true}` at QoS 0
([bridge.ts](https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/extension/bridge.ts)),
`bridge/state` and the will with `{retain: true, qos: 1}`
([mqtt.ts](https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/mqtt.ts)).
Z2M subscribes to `zigbee2mqtt/#` at the default QoS 0. Per-device `retain`, `qos` and
`optimistic` (default true: publish the assumed state right after a `/set`) are device options
([settings.schema.json](https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/util/settings.schema.json)).

There is no bridge request that re-publishes `bridge/devices`: a client learns the device list
from the retained message (or after a join/leave/rename/restart). Device state after a service
restart comes from retained device state (if `retain: true` is set per device) or from `/get`.

### Exposes: discovering what a device can do

Each entry in `bridge/devices` carries `definition.exposes`: typed features with an `access`
bitmask (1 = in published state, 2 = settable via `/set`, 4 = readable via `/get`). Generic
types: `binary`, `numeric` (`value_min/max/step`, `unit`, `presets`), `enum`, `text`,
`composite`, `list`. Specific types: `light`, `climate`, `switch`, `lock`, `fan`, `cover`.
Source: [Exposes](https://www.zigbee2mqtt.io/guide/usage/exposes.html).
`definition` is `null` for unsupported devices (`supported: false`).

### Our device types

**Lights** ([exposes.ts](https://github.com/Koenkk/zigbee-herdsman-converters/blob/master/src/lib/exposes.ts)):
- `state` `ON`/`OFF`/`TOGGLE`, `brightness` 0..254, `color_temp` in **mired** with a per-device
  `value_min`/`value_max` and presets `coolest`, `cool` (250), `neutral` (370), `warm` (454),
  `warmest`; `color_xy` / `color_hs` for colour bulbs; `color_temp_startup` (65535 = previous).
- `transition` (seconds) can be put in any `/set` message or set as a device/group option;
  the converter reads `message.transition` first
  ([utils.ts getTransition](https://github.com/Koenkk/zigbee-herdsman-converters/blob/master/src/lib/utils.ts)).
  IKEA quirk: brightness plus colour with transition skips the brightness transition.
- Example: `zigbee2mqtt/kitchen_ceiling/set` `{"state":"ON","brightness":180,"color_temp":370,"transition":1}`.

**Thermostats / TRVs** (`climate` expose):
- `occupied_heating_setpoint` (or `current_heating_setpoint` on some devices, never both),
  `local_temperature`, `system_mode` (`off|heat|cool|auto|dry|fan_only`, device subset),
  `running_state` (`idle|heat|cool`), `preset` (device-specific values),
  `local_temperature_calibration`, `pi_heating_demand`.
- **Schedules are device-specific.** Standard ZCL thermostats use `weekly_schedule`
  (`{"weekly_schedule":{"dayofweek":["monday"],"transitions":[{"heatSetpoint":20,"transitionTime":"18:00"}]}}`,
  [toZigbee.ts thermostat_weekly_schedule](https://github.com/Koenkk/zigbee-herdsman-converters/blob/master/src/converters/toZigbee.ts));
  Tuya TRVs have their own schedule formats (the Tuya converter file alone has ~290 schedule
  references), Danfoss/Bosch have their own sets. Not every TRV has an on-device schedule at all.

**Temperature/humidity sensors**: read-only numeric `temperature` (°C), `humidity` (%),
usually `battery`, `linkquality`; often `pressure`. Battery devices are sleepy: no `/get`.

**Motion sensors**: read-only binary `occupancy`, often `illuminance`. The "no motion" edge is
synthesised by Z2M via the `occupancy_timeout` option (default 90 s on Aqara and IKEA; the
Aqara sensor ignores motion for 60 s after a trigger)
([RTCGQ11LM](https://www.zigbee2mqtt.io/devices/RTCGQ11LM.html),
[E1525/E1745](https://www.zigbee2mqtt.io/devices/E1525_E1745.html)).
`no_occupancy_since` can emit extra messages at configured delays.

### Availability

Off by default (`availability: enabled: true`). Mains devices ("active") are pinged if silent for
10 min (backoff 10/15/30/60/120 min); battery devices ("passive") go offline after 25 h of
silence. Any Zigbee message counts as a check-in. Per-device override possible.
Source: [Device availability](https://www.zigbee2mqtt.io/guide/configuration/device-availability.html).

## 2. Groups and scenes: native versus in the service

**Groups** ([Groups](https://www.zigbee2mqtt.io/guide/usage/groups.html)):
- Membership is stored **on each device**, not on the coordinator. A `/set` to a group is one
  broadcast; each member decides whether it belongs. "Groups are much more efficient than
  controlling devices separately."
- Created via `bridge/request/group/add`, members via `group/members/add|remove|remove_all`
  (`{"group":"living_room","device":"lamp_1"}`). Controlled exactly like a device:
  `zigbee2mqtt/living_room/set`.
- Group state is computed by Z2M (`off_state: all_members_off` default, `optimistic: true`).

**Native Zigbee scenes** ([Scenes](https://www.zigbee2mqtt.io/guide/usage/scenes.html)):
- Commands go to `zigbee2mqtt/<group or device>/set`: `scene_store` (snapshot current state),
  `scene_add` (explicit `state`, `brightness` 0..254, `color_temp` 0..500, `color`, `transition`),
  `scene_recall`, `scene_remove`, `scene_remove_all`, `scene_rename`. `SCENE_ID` is a number.
- Transition can only be set via `scene_add`; `scene_store` keeps an existing transition.
- Per-light values inside a group scene: send `scene_add`/`scene_store` with `group_id` to the
  individual light.
- Scene metadata (ID, name) is published in `bridge/groups[].scenes`.
- The scene table lives in the devices' Scenes cluster (ZCL semantics; the Z2M page does not
  spell this out). Device support varies; the docs only say scenes are mostly for bulbs.
- **Lights only.** A scene cannot carry a thermostat setpoint across device types in practice;
  the Z2M scene attributes are `state`, `brightness`, `color_temp`, `color`.

**Comparison**

| | Native group + scene | Scene kept in the service |
|---|---|---|
| Radio traffic | one broadcast per recall | one `/set` per device (or per group) |
| Lights change in sync | yes | staggered by message order |
| Works with service down | yes, if something sends the recall: a bound remote (genScenes binding), Z2M frontend, any MQTT client | no |
| Target temperature in the scene | no | yes |
| Edit cost | every change is written to every member over Zigbee | a DB row |
| Drift risk | device tables and the service's model can diverge (factory reset bulb, replaced bulb) | none, single source of truth |
| Room = group | one Z2M group per Room maps cleanly | n/a |

A hybrid is possible: the service owns the Scene definition and writes it into a per-Room
group via `scene_add` (light part) while applying the target temperature itself.

## 3. Bindings as a fallback

Source: [Binding](https://www.zigbee2mqtt.io/guide/usage/binding.html).
- Direct device-to-device control that "works even when home automation software,
  Zigbee2MQTT, or the coordinator is down."
- `bridge/request/device/bind` / `unbind` with `{"from":"<source>","to":"<target device or group>"}`
  (friendly names; group IDs do not work); optional `clusters` subset of
  `genScenes`, `genOnOff`, `genLevelCtrl`, `lightingColorCtrl`, `closuresWindowCovering`.
- Binding battery devices fails while they sleep; wake the device right before sending.
- Bind sources are **controller-type** devices that emit On/Off or Level commands (remotes,
  dimmers, some motion sensors). Example: IKEA E1745 motion sensor sends
  `commandOnWithTimedOff` (on for `ontime`) and "can be bound to groups"
  ([E1525/E1745](https://www.zigbee2mqtt.io/devices/E1525_E1745.html)).
- Many motion sensors only *report* occupancy and cannot be bound: the Aqara RTCGQ11LM and
  Philips Hue motion sensor pages mention no binding
  ([RTCGQ11LM](https://www.zigbee2mqtt.io/devices/RTCGQ11LM.html),
  [Hue SML001](https://www.zigbee2mqtt.io/devices/9290012607.html)). Bound motion lighting has
  no lux or time-of-day logic beyond what the sensor itself implements.
- A Zigbee thermostat's own `weekly_schedule` (where supported) is the equivalent fallback for
  heating: it keeps running without Z2M and without the service.

## 4. Broker: Mosquitto or NATS's built-in MQTT

### What NATS MQTT is
Sources: [MQTT overview](https://docs.nats.io/running-a-nats-service/configuration/mqtt),
[Topics and subjects](https://docs.nats.io/learn/mqtt/topics-and-subjects),
[QoS, sessions, retained](https://docs.nats.io/learn/mqtt/qos-sessions-and-retained),
[Auth and clustering](https://docs.nats.io/learn/mqtt/auth-and-clustering),
[mqtt config reference](https://docs.nats.io/running-a-nats-service/configuration/mqtt/mqtt_config),
[server/mqtt.go](https://github.com/nats-io/nats-server/blob/main/server/mqtt.go),
[README-MQTT.md](https://github.com/nats-io/nats-server/blob/main/server/README-MQTT.md).

- **MQTT 3.1.1 only.** v5 clients are rejected with CONNACK code 1. Z2M defaults to
  `mqtt.version: 4` (= 3.1.1), so it connects; the v5-only device option `retention`
  (message expiry) would be unavailable.
- **JetStream required** (sessions, QoS 1/2, retained messages live in streams).
  Our dev NATS already runs with `--jetstream` (`dev/infra.yml`). `server_name` is only required
  in a cluster/gateway setup.
- **QoS 0, 1, 2** between MQTT clients (QoS 2 since 2.10). Messages **published by NATS clients
  arrive at MQTT subscribers as QoS 0**; NATS clients have no delivery guarantee. Z2M subscribes
  at QoS 0 anyway, so a NATS publish to `zigbee2mqtt.<name>.set` is equivalent to what it gets
  from Mosquitto today.
- **Mapping:** `/` -> `.`, MQTT `.` -> `//` (since 2.10), `+` -> `*`, `#` -> `>`.
  `zigbee2mqtt/kitchen_ceiling/set` is the NATS subject `zigbee2mqtt.kitchen_ceiling.set`.
- **Spaces are refused** ("has never been accepted on any version"; also tab, CR, LF, FF, DEL).
  A PUBLISH to such a topic **closes the client connection**. Z2M itself allows spaces in
  friendly names (its validation only forbids leading/trailing `/`, control chars, `+`, `#`,
  and a trailing `/<digits>`,
  [utils.ts validateFriendlyName](https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/util/utils.ts)).
  One device named `Living Room Lamp` would make Z2M's state publish kill its own connection,
  every time it reconnects. Names must be space-free, enforced by convention.
- **Retained messages** are stored by the server in stream `$MQTT_rmsgs`, one message per subject
  (`MaxMsgsPer: 1`) on `$MQTT.rmsgs.<converted subject>`, original payload as body plus
  `Nmqtt-R*` headers (mqtt.go). MQTT subscribers get them on subscribe. **A plain NATS
  subscriber does not**: it sees only live traffic. A NATS-only service would have to read
  `bridge/devices`, `bridge/groups`, availability etc. from that internal stream (JetStream
  "get last message for subject" on `$MQTT.rmsgs.zigbee2mqtt.bridge.devices`). The layout is an
  internal detail; it was migrated once already (single subject `$MQTT.rmsg` -> per-subject).
  NATS publishes never become retained messages.
- **Will message** works and reaches NATS subscribers on the converted subject, so
  `zigbee2mqtt.bridge.state` shows `{"state":"offline"}` when Z2M dies.
- Z2M itself re-publishes all its retained messages 2 s after connecting if it does not see its
  own retained `bridge/info` come back, to cope with brokers that do not persist retained
  messages ([mqtt.ts onConnect](https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/mqtt.ts)).
- Clustered NATS: retained delivery is best-effort across servers (irrelevant for one Pi).
- Defaults to watch: `max_ack_pending` 100 per QoS 1 subscription, a `#` filter below the top
  level costs two subscriptions.
- Known limitation in README-MQTT: JetStream QoS redelivery happens out of the original order.

### Mosquitto
Plain MQTT 3.1.1/5 broker; retained messages and QoS behave as Z2M expects; it is what Z2M is
tested against. Cost: a second broker next to NATS and a second client protocol in the service.
(Not researched further; well-known baseline.)

## 5. Rust MQTT client (if the service speaks MQTT)

| Crate | Latest | Notes |
|---|---|---|
| [rumqttc](https://crates.io/crates/rumqttc) | 0.25.1 (2025-11-21), repo pushed 2026-05-01, ~2.2 M recent downloads | pure Rust, tokio, MQTT 3.1.1 and v5 (`rumqttc::v5`), rustls by default (`use-rustls`), optional websocket/proxy, MSRV 1.64. Event-loop API: you must poll `EventLoop` yourself. ~185 open issues in the [rumqtt repo](https://github.com/bytebeamio/rumqtt). |
| [paho-mqtt](https://crates.io/crates/paho-mqtt) | 0.14.0 (2026-03-26) | Eclipse binding over the C library `paho.mqtt.c` (`bundled` builds it with cmake, `ssl` needs OpenSSL / `vendored-ssl`). Extra friction for our musl static Docker build. |
| [ntex-mqtt](https://crates.io/crates/ntex-mqtt) | 9.2.1 (2026-10-07) | tied to the ntex runtime, not tokio/galvyn. |
| mqtt-async-client | 0.3.1 (2021) | unmaintained. |

The workspace already depends on `async-nats ~0.50.0` (root `Cargo.toml`), so the NATS route
adds no new client crate.

## Implications for the decision

- The device-facing contract is small and stable: `bridge/devices` (+ exposes) for discovery,
  `<name>` for state, `<name>/set` for commands, `<name>/availability`, `bridge/event`,
  `bridge/request|response` with `transaction`. Typed Rust structs per device type can be driven
  from `exposes` (ranges such as mired min/max differ per bulb).
- Thermostat schedules are the least uniform part: on-device schedule formats differ per vendor
  and some TRVs have none. Keeping the schedule in the service (sending setpoints) is uniform;
  pushing it to the device is what survives the service being down. Which TRVs are in the house
  decides how much of the second option is available.
- Native groups per Room are cheap and also the binding target for remotes and bindable motion
  sensors. Native scenes cover only the light part of our Scene concept; the target temperature
  has to be applied by the service either way.
- Whether a motion light can run without the service depends on the sensor model: E1745-style
  sensors bind, Aqara/Hue-style sensors do not.
- NATS-only is workable but not free: (a) friendly names must never contain spaces, otherwise
  Z2M's connection is closed; (b) retained `bridge/devices`, `bridge/groups` and availability are
  not visible to a plain NATS subscriber and must be read from the internal `$MQTT_rmsgs`
  stream; (c) commands from NATS are QoS 0, the same as Z2M's own subscription today. Mosquitto
  plus `rumqttc` avoids (a) and (b) at the cost of a second broker and protocol.
- Enabling Z2M availability (off by default) is needed for any "device offline" display.
