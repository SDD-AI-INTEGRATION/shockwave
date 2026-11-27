# Visual system

The workspace uses fluid data layouts and a focused settings column. Form controls share 40 px heights, 7 px radius, 12 px horizontal padding, and adjacent required markers. Picker and action overlays use the same viewport-aware floating surface. The calendar presents Indonesian dates and stores ISO dates. Standard selects retain native keyboard behavior with a shared visual treatment.

Project views use separate status and pillar groups, categorical pillar colors, tabular monetary figures, and distinct widths for reading and editing. Meeting review preserves existing states and separates the queue, review actions, and previous information. The assistant is a resizable companion panel on desktop and an overlay on smaller viewports. Document printing retains the original types and data. The paginated preview calls the same A4 PDF generator as download.

Navigation uses Solar Linear icons by [480 Design](https://github.com/480-Design/Solar-Icon-Set), distributed through [Iconify Solar](https://icon-sets.iconify.design/solar/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Local SVGs are displayed as color masks.

## Shared controls

`design.css` holds the typography, spacing, surface and status tokens, including placeholder, focus, motion, and download-format colors. The React controls in `form-controls.tsx` and the separate Operasional editor consume the same tokens. A placeholder is an empty-state presentation. Where an empty selection is a valid action, the dropdown exposes a separate clear action or an explicit empty value.

Use `SearchableSelect` for options from an existing catalog and `UserSelect` for account IDs from the workspace directory. The latter displays the account's group and searches the name, group, and email. Existing text-only roles in documents remain text, and project contact references remain in the project catalog.

`ConfirmDialog` captures the object and consequence for protected actions. Ordinary edits and autosave use status feedback. `ActionMenu` and `DownloadMenu` take explicit item definitions, including the icon and action. Pass only formats the current view can export.
