# System Architecture page - design notes

The `/ims/architecture` page (IMS Hub, "Customisation and system settings") is modelled on a
reference "application dependency map" layout. These are the design traits taken from it, and how
each is used for IMS.

## Layout

- **Hub and spokes.** One emphasised centre card (the thing being described) sits in the middle of a
  3 x 3 grid. Eight satellite cards surround it, each joined to the centre by a coloured connector.
  - Connectors are rounded elbow curves with a dot at each end, in the satellite card's accent colour.
  - IMS: the centre is Ims himself. The satellites are:
    - Owner and access
    - Clients
    - AI models
    - Conversation pipeline
    - External connections
    - Data stores
    - Services
    - Environment
- **Supporting row.** A final row of cards without connectors holds detail that belongs to the whole
  system rather than one relationship. For IMS these are:
  - Background jobs
  - Guardrails
  - Desk terminal firmware
- **Detail panel.** A fixed-width panel on the right summarises the system:
  - A header block: logo tile, name, status pills, and a line of metadata.
  - Tabs.
  - A key/value "Key information" table.
  - A row of four stat tiles.
  - A grid of pastel action tiles.
  - A findings list with warning icons.
- **Phone.** The grid collapses to one column: centre card first, no connectors, and the panel below.

## Card anatomy

- The card is white (or dark slate in dark mode), with rounded 2xl corners, a hairline border and a soft shadow.
- The header has:
  - a round pastel icon badge in the accent colour
  - a bold title
  - a grey count pill
  - a chevron
- Rows have:
  - a small accent-coloured icon
  - a primary line in medium weight
  - a secondary line in grey
- Every card has one accent colour, used for its badge, row icons and connector. The colours are
  distinct around the ring so each relationship can be traced by colour alone.

## Content rules

- Everything shown must be true of the current build, checked against the code:
  - ports, model IDs, polling intervals, table names, external hosts, rules
- Figures that change are fetched live from `/api/system/architecture`:
  - table count, news sources, birthdays, tasks, scheduled items
  - whether the desk terminal is connected
  - server uptime and Node version
- When the system changes, update this page with it, the same way the Hub's `LINKS` list is updated for new pages.
